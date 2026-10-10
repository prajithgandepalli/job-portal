import mongoose from "mongoose";

const JobApplicationSchema = new mongoose.Schema({
    userId: { type: String, ref: 'User', required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    status: { type: String, default: 'Pending' },
    date: { type: Number, required: true },
    aiAnalysis: {
        status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
        matchScore: { type: Number, default: 0 },
        matchedSkills: [{ type: String }],
        missingSkills: [{ type: String }],
        experienceMatch: { type: String, default: 'N/A' },
        educationMatch: { type: String, default: 'N/A' },
        relevantExperience: [{ type: String }],
        relevantProjects: [{ type: String }],
        summary: { type: String, default: '' },
        potentialGaps: [{ type: String }],
        interviewFocus: [{ type: String }],
        interviewQuestions: [{
            question: String,
            category: String,
            context: String
        }],
        analyzedAt: { type: Date }
    }
})

const JobApplication = mongoose.model('JobApplication', JobApplicationSchema)

export default JobApplication