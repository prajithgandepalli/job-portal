import Company from "../models/Company.js";
import bcrypt from 'bcrypt'
import generateToken from "../utils/generateToken.js";
import Job from "../models/Job.js";
import JobApplication from "../models/JobApplication.js";
import User from "../models/User.js";
import { resolveResumeText, stripHtml } from "../utils/resumeExtractor.js";
import { analyzeResumeAgainstJob, generateInterviewQuestions } from "../services/aiService.js";
import { v2 as cloudinary } from 'cloudinary';

// Register a new company
export const registerCompany = async (req, res) => {

    const { name, email, password } = req.body

    const imageFile = req.file;

    if (!name || !email || !password || !imageFile) {
        return res.json({ success: false, message: "Missing Details" })
    }

    try {

        const companyExists = await Company.findOne({ email })

        if (companyExists) {
            return res.json({ success: false, message: 'Company already registered' })
        }

        const salt = await bcrypt.genSalt(10)
        const hashPassword = await bcrypt.hash(password, salt)

        const imageUpload = await cloudinary.uploader.upload(imageFile.path)

        const company = await Company.create({
            name,
            email,
            password: hashPassword,
            image: imageUpload.secure_url
        })

        res.json({
            success: true,
            company: {
                _id: company._id,
                name: company.name,
                email: company.email,
                image: company.image
            },
            token: generateToken(company._id)
        })

    } catch (error) {
        if (error.code === 11000 || error.message.includes('E11000')) {
            return res.json({ success: false, message: 'A company with this email address is already registered. Please log in.' })
        }
        res.json({ success: false, message: error.message })
    }
}

// Login Company
export const loginCompany = async (req, res) => {

    const { email, password } = req.body

    try {

        const company = await Company.findOne({ email })

        if (await bcrypt.compare(password, company.password)) {

            res.json({
                success: true,
                company: {
                    _id: company._id,
                    name: company.name,
                    email: company.email,
                    image: company.image
                },
                token: generateToken(company._id)
            })

        }
        else {
            res.json({ success: false, message: 'Invalid email or password' })
        }

    } catch (error) {
        res.json({ success: false, message: error.message })
    }

}

// Get Company Data
export const getCompanyData = async (req, res) => {

    try {

        const company = req.company

        res.json({ success: true, company })

    } catch (error) {
        res.json({
            success: false, message: error.message
        })
    }

}

// Post New Job
export const postJob = async (req, res) => {

    const { title, description, location, salary, level, category } = req.body

    const companyId = req.company._id

    try {

        const newJob = new Job({
            title,
            description,
            location,
            salary,
            companyId,
            date: Date.now(),
            level,
            category
        })

        await newJob.save()

        res.json({ success: true, newJob })

    } catch (error) {

        res.json({ success: false, message: error.message })

    }


}

// Get Company Job Applicants
export const getCompanyJobApplicants = async (req, res) => {
    try {

        const companyId = req.company._id

        // Find job applications for the recruiter company and populate related data
        const applications = await JobApplication.find({ companyId })
            .populate('userId', 'name image resume email')
            .populate('jobId', 'title location category level salary description')
            .exec()

        return res.json({ success: true, applications })

    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}

// Get Company Posted Jobs
export const getCompanyPostedJobs = async (req, res) => {
    try {

        const companyId = req.company._id

        const jobs = await Job.find({ companyId })

        // Adding No. of applicants info in data
        const jobsData = await Promise.all(jobs.map(async (job) => {
            const applicants = await JobApplication.find({ jobId: job._id });
            return { ...job.toObject(), applicants: applicants.length }
        }))

        res.json({ success: true, jobsData })

    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}

// Change Job Application Status
export const ChangeJobApplicationsStatus = async (req, res) => {

    try {

        const { id, status } = req.body

        // Find Job application and update status
        await JobApplication.findOneAndUpdate({ _id: id }, { status })

        res.json({ success: true, message: 'Status Changed' })

    } catch (error) {

        res.json({ success: false, message: error.message })

    }
}

// Change Job Visiblity
export const changeVisiblity = async (req, res) => {
    try {

        const { id } = req.body

        const companyId = req.company._id

        const job = await Job.findById(id)

        if (companyId.toString() === job.companyId.toString()) {
            job.visible = !job.visible
        }

        await job.save()

        res.json({ success: true, job })

    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}

// Manually trigger or retry AI Resume-Job Analysis for an Application
export const reanalyzeApplication = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.company._id;

        const application = await JobApplication.findById(id)
            .populate('userId')
            .populate('jobId');

        if (!application) {
            return res.json({ success: false, message: 'Application not found' });
        }

        // Authorization check: recruiter can only analyze applications for their company
        if (application.companyId.toString() !== companyId.toString()) {
            return res.status(403).json({ success: false, message: 'Unauthorized access' });
        }

        if (!application.userId || !application.userId.resume) {
            return res.json({ success: false, message: 'Candidate has not uploaded a resume yet' });
        }

        const resumeText = await resolveResumeText(application.userId);
        const plainJobDescription = stripHtml(application.jobId.description);

        const aiAnalysis = await analyzeResumeAgainstJob(
            resumeText,
            plainJobDescription,
            application.jobId.title,
            application.jobId.level,
            application.jobId.category
        );

        application.aiAnalysis = aiAnalysis;
        await application.save();

        if (aiAnalysis.status === 'failed') {
            return res.json({ success: false, message: aiAnalysis.summary || 'AI analysis failed', aiAnalysis });
        }

        res.json({ success: true, message: 'AI Analysis completed successfully', aiAnalysis });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Generate AI Interview Questions for Shortlisted Candidate (Optional AI Feature)
export const generateInterviewQuestionsForApplicant = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.company._id;

        const application = await JobApplication.findById(id)
            .populate('userId')
            .populate('jobId');

        if (!application) {
            return res.json({ success: false, message: 'Application not found' });
        }

        if (application.companyId.toString() !== companyId.toString()) {
            return res.status(403).json({ success: false, message: 'Unauthorized access' });
        }

        if (!application.userId || !application.userId.resume) {
            return res.json({ success: false, message: 'Candidate resume not available' });
        }

        const resumeText = await resolveResumeText(application.userId);
        const plainJobDescription = stripHtml(application.jobId.description);

        const questions = await generateInterviewQuestions(
            resumeText,
            plainJobDescription,
            application.jobId.title
        );

        application.aiAnalysis = application.aiAnalysis || {};
        application.aiAnalysis.interviewQuestions = questions;
        await application.save();

        res.json({ success: true, questions });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};
