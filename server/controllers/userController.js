import fs from 'fs';
import path from 'path';
import Job from "../models/Job.js"
import JobApplication from "../models/JobApplication.js"
import User from "../models/User.js"
import { v2 as cloudinary } from "cloudinary"
import { downloadResumeBufferFromCloudinary, extractTextFromLocalFile, resolveResumeText, stripHtml } from "../utils/resumeExtractor.js"
import { analyzeResumeAgainstJob } from "../services/aiService.js"
import { clerkClient } from "@clerk/express"

// Helper: get or create a user from Clerk
const getOrCreateClerkUser = async (userId) => {
    let user = await User.findById(userId);

    try {
        const clerkUser = await clerkClient.users.getUser(userId);
        const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 'Student User';
        const email = clerkUser.emailAddresses?.[0]?.emailAddress || `user_${userId.slice(-6)}@example.com`;
        const image = clerkUser.imageUrl || '';

        if (!user) {
            user = await User.create({ _id: userId, name, email, image, resume: '', resumeText: '' });
        } else if (user.email.includes('@example.com') || user.name === 'Student User') {
            user.name = name;
            user.email = email;
            if (image) user.image = image;
            await user.save();
        }
    } catch (err) {
        console.warn('Clerk API fetch warning:', err.message);
        if (!user) {
            user = await User.create({
                _id: userId,
                name: 'Student User',
                email: `user_${userId.slice(-6)}@example.com`,
                image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
                resume: '',
                resumeText: ''
            });
        }
    }
    return user;
};

// Get User Data
export const getUserData = async (req, res) => {
    const userId = req.auth.userId;
    try {
        const user = await getOrCreateClerkUser(userId);
        if (!user) return res.json({ success: false, message: 'User Not Found' });
        res.json({ success: true, user });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Apply For Job
export const applyForJob = async (req, res) => {
    const { jobId } = req.body;
    const userId = req.auth.userId;

    try {
        const isAlreadyApplied = await JobApplication.find({ jobId, userId });
        if (isAlreadyApplied.length > 0) return res.json({ success: false, message: 'Already Applied' });

        const jobData = await Job.findById(jobId);
        if (!jobData) return res.json({ success: false, message: 'Job Not Found' });

        const userData = await getOrCreateClerkUser(userId);

        let aiAnalysis = {
            status: 'pending', matchScore: 0, matchedSkills: [], missingSkills: [],
            experienceMatch: 'N/A', educationMatch: 'N/A', relevantExperience: [],
            relevantProjects: [], summary: 'Analysis pending', potentialGaps: [],
            interviewFocus: [], analyzedAt: new Date()
        };

        if (userData && (userData.resumeText || userData.resume)) {
            try {
                const resumeText = await resolveResumeText(userData);
                const plainJobDescription = stripHtml(jobData.description);
                aiAnalysis = await analyzeResumeAgainstJob(
                    resumeText,
                    plainJobDescription,
                    jobData.title,
                    jobData.level,
                    jobData.category
                );
            } catch (aiErr) {
                console.error("AI Analysis failed:", aiErr.message);
                aiAnalysis.status = 'failed';
                aiAnalysis.summary = `AI matching error: ${aiErr.message}`;
            }
        }

        await JobApplication.create({ companyId: jobData.companyId, userId, jobId, date: Date.now(), aiAnalysis });
        res.json({ success: true, message: 'Applied Successfully' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Get User Applied Applications Data
export const getUserJobApplications = async (req, res) => {
    try {
        const userId = req.auth.userId;
        const applications = await JobApplication.find({ userId })
            .populate('companyId', 'name email image')
            .populate('jobId', 'title description location category level salary')
            .exec();
        return res.json({ success: true, applications: applications || [] });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Update User Resume
export const updateUserResume = async (req, res) => {
    try {
        const userId = req.auth.userId;
        const resumeFile = req.file;
        const userData = await getOrCreateClerkUser(userId);

        if (resumeFile) {
            // 1. Extract plain text immediately from local file at upload time
            try {
                const text = await extractTextFromLocalFile(resumeFile.path, resumeFile.originalname);
                userData.resumeText = text;
            } catch (err) {
                console.warn('Local resume text extraction warning:', err.message);
            }

            // 2. Cache local PDF copy
            try {
                const localDir = path.join(process.cwd(), 'uploads', 'resumes');
                fs.mkdirSync(localDir, { recursive: true });
                const localPath = path.join(localDir, `${userId}.pdf`);
                fs.copyFileSync(resumeFile.path, localPath);
            } catch (e) {
                console.warn('Local resume caching warning:', e.message);
            }

            // 3. Upload PDF as a public raw file so it is not treated as an image
            const resumeUpload = await cloudinary.uploader.upload(resumeFile.path, {
                resource_type: 'raw',
                access_mode: 'public',
                folder: 'resumes',
                use_filename: true,
                unique_filename: true
            });
            userData.resume = resumeUpload.secure_url;
        }

        await userData.save();
        return res.json({ success: true, message: 'Resume Updated' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Serve/stream resume PDF directly in browser
export const getResumeFile = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        if (!user || !user.resume) {
            return res.status(404).send('Resume not found');
        }

        const localDir = path.join(process.cwd(), 'uploads', 'resumes');
        const localPath = path.join(localDir, `${userId}.pdf`);

        if (fs.existsSync(localPath)) {
            const localBuffer = fs.readFileSync(localPath);
            if (localBuffer.slice(0, 5).toString('utf-8') === '%PDF-') {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', 'inline; filename="resume.pdf"');
                res.setHeader('Content-Length', localBuffer.length);
                return res.send(localBuffer);
            }
        }

        // Fetch using authenticated Cloudinary archive download
        const buffer = await downloadResumeBufferFromCloudinary(user.resume);

        if (!buffer || buffer.slice(0, 5).toString('utf-8') !== '%PDF-') {
            return res.status(502).send('Resume file is not a valid PDF. Please re-upload the resume.');
        }

        // Cache locally for future instant loads
        try {
            fs.mkdirSync(localDir, { recursive: true });
            fs.writeFileSync(localPath, buffer);
        } catch (e) {
            console.warn('Failed to cache resume locally:', e.message);
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="resume.pdf"');
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
    } catch (err) {
        console.error('Error serving resume file:', err.message);
        return res.status(500).send('Error loading resume: ' + err.message);
    }
};