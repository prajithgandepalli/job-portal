import { useContext, useEffect, useState } from 'react'
import { assets } from '../assets/assets'
import { AppContext } from '../context/AppContext'
import axios from 'axios'
import { toast } from 'react-toastify'
import Loading from '../components/Loading'

const ViewApplications = () => {

  const { backendUrl, companyToken } = useContext(AppContext)

  const [applicants, setApplicants] = useState(false)
  const [selectedApplicant, setSelectedApplicant] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false)

  // Function to fetch company Job Applications data 
  const fetchCompanyJobApplications = async () => {

    try {

      const { data } = await axios.get(backendUrl + '/api/company/applicants',
        { headers: { token: companyToken } }
      )

      if (data.success) {
        const sortedApps = data.applications.reverse()
        setApplicants(sortedApps)
        
        // If an applicant is currently selected in modal, update its state
        if (selectedApplicant) {
          const updated = sortedApps.find(a => a._id === selectedApplicant._id)
          if (updated) setSelectedApplicant(updated)
        }
      } else {
        toast.error(data.message)
      }

    } catch (error) {
      toast.error(error.message)
    }

  }

  // Function to Update Job Applications Status 
  const changeJobApplicationStatus = async (id, status) => {
    try {

      const { data } = await axios.post(backendUrl + '/api/company/change-status',
        { id, status },
        { headers: { token: companyToken } }
      )

      if (data.success) {
        toast.success(`Application mark as ${status}`)
        fetchCompanyJobApplications()
      } else {
        toast.error(data.message)
      }

    } catch (error) {
      toast.error(error.message)
    }
  }

  // Function to trigger AI re-analysis for a candidate
  const handleReanalyze = async (applicationId) => {
    setIsAnalyzing(true)
    try {
      const { data } = await axios.post(
        `${backendUrl}/api/company/analyze-application/${applicationId}`,
        {},
        { headers: { token: companyToken } }
      )

      if (data.success) {
        toast.success("AI Analysis updated successfully!")
        fetchCompanyJobApplications()
      } else {
        toast.error(data.message || "Failed to analyze resume")
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Function to generate AI interview questions
  const handleGenerateQuestions = async (applicationId) => {
    setIsGeneratingQuestions(true)
    try {
      const { data } = await axios.post(
        `${backendUrl}/api/company/interview-questions/${applicationId}`,
        {},
        { headers: { token: companyToken } }
      )

      if (data.success) {
        toast.success("AI Interview Questions generated!")
        fetchCompanyJobApplications()
      } else {
        toast.error(data.message || "Failed to generate questions")
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsGeneratingQuestions(false)
    }
  }

  useEffect(() => {
    if (companyToken) {
      fetchCompanyJobApplications()
    }
  }, [companyToken])

  // Helper badge color for match score
  const getScoreBadgeClass = (score) => {
    if (!score && score !== 0) return 'bg-gray-100 text-gray-600 border-gray-200'
    if (score >= 75) return 'bg-emerald-50 text-emerald-700 border-emerald-300'
    if (score >= 50) return 'bg-amber-50 text-amber-700 border-amber-300'
    return 'bg-rose-50 text-rose-700 border-rose-300'
  }

  return applicants ? applicants.length === 0 ? (
    <div className='flex items-center justify-center h-[70vh]'>
      <p className='text-xl sm:text-2xl text-gray-500'>No Applications Available</p>
    </div>
  ) : (
    <div className='container mx-auto p-4 max-w-6xl'>
      <div className='flex justify-between items-center mb-6'>
        <div>
          <h1 className='text-2xl font-semibold text-gray-800'>Applicant Analysis Dashboard</h1>
          <p className='text-sm text-gray-500 mt-1'>AI-assisted resume screening and candidate insights</p>
        </div>
        <span className='bg-blue-50 text-blue-700 text-xs px-3 py-1.5 rounded-full font-medium border border-blue-200'>
          Total Applicants: {applicants.filter(item => item.jobId && item.userId).length}
        </span>
      </div>

      <div className='bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='w-full text-left border-collapse max-sm:text-sm'>
            <thead>
              <tr className='bg-gray-50 text-gray-600 text-xs uppercase font-medium border-b border-gray-200'>
                <th className='py-3 px-4 text-center'>#</th>
                <th className='py-3 px-4'>Candidate Name</th>
                <th className='py-3 px-4 max-sm:hidden'>Job Title</th>
                <th className='py-3 px-4 text-center'>AI Match Score</th>
                <th className='py-3 px-4 text-center'>Status</th>
                <th className='py-3 px-4 text-center'>Resume</th>
                <th className='py-3 px-4 text-center'>AI Insights</th>
                <th className='py-3 px-4 text-center'>Decision</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-200 text-gray-700 text-sm'>
              {applicants.filter(item => item.jobId && item.userId).map((applicant, index) => {
                const ai = applicant.aiAnalysis || {}
                const score = ai.matchScore || 0

                return (
                  <tr key={applicant._id || index} className='hover:bg-gray-50/80 transition-colors'>
                    <td className='py-3.5 px-4 text-center font-mono text-gray-400'>{index + 1}</td>
                    <td className='py-3.5 px-4 flex items-center gap-3'>
                      <img className='w-9 h-9 rounded-full object-cover border max-sm:hidden' src={applicant.userId.image} alt="" />
                      <div>
                        <div className='font-medium text-gray-900'>{applicant.userId.name}</div>
                        <div className='text-xs text-gray-400'>{applicant.userId.email}</div>
                      </div>
                    </td>
                    <td className='py-3.5 px-4 max-sm:hidden font-medium text-gray-800'>
                      {applicant.jobId.title}
                    </td>
                    <td className='py-3.5 px-4 text-center'>
                      {ai.status === 'completed' && score > 0 ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${getScoreBadgeClass(score)}`}>
                          ✨ {score}% Match
                        </span>
                      ) : (
                        <button
                          onClick={() => handleReanalyze(applicant._id)}
                          disabled={isAnalyzing}
                          className='text-xs text-blue-600 hover:text-blue-800 underline font-medium'
                        >
                          {isAnalyzing ? 'Analyzing...' : (ai.status === 'completed' ? 'Re-run AI Analysis' : 'Run AI Analysis')}
                        </button>
                      )}
                    </td>
                    <td className='py-3.5 px-4 text-center'>
                      <span className={`inline-block px-2.5 py-1 rounded text-xs font-medium ${
                        applicant.status === 'Accepted' ? 'bg-green-100 text-green-800' :
                        applicant.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {applicant.status}
                      </span>
                    </td>
                    <td className='py-3.5 px-4 text-center'>
                      {applicant.userId.resume ? (
                        <a href={`${backendUrl}/api/users/resume/${applicant.userId._id}`} target='_blank' rel='noreferrer'
                          className='text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded text-xs inline-flex items-center gap-1 font-medium border border-blue-200'
                        >
                          Resume <img className='w-3 h-3' src={assets.resume_download_icon} alt="" />
                        </a>
                      ) : (
                        <span className='text-xs text-gray-400 italic'>No Resume</span>
                      )}
                    </td>
                    <td className='py-3.5 px-4 text-center'>
                      <button
                        onClick={() => setSelectedApplicant(applicant)}
                        className='bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs px-3 py-1.5 rounded-md font-medium shadow-sm transition-all'
                      >
                        View AI Breakdown
                      </button>
                    </td>
                    <td className='py-3.5 px-4 text-center'>
                      <div className='flex justify-center items-center gap-1.5'>
                        <button
                          onClick={() => changeJobApplicationStatus(applicant._id, 'Accepted')}
                          className={`px-2.5 py-1 text-xs rounded font-medium border transition-colors ${
                            applicant.status === 'Accepted' 
                              ? 'bg-green-600 text-white border-green-600' 
                              : 'bg-white text-green-600 border-green-300 hover:bg-green-50'
                          }`}
                        >
                          Shortlist
                        </button>
                        <button
                          onClick={() => changeJobApplicationStatus(applicant._id, 'Rejected')}
                          className={`px-2.5 py-1 text-xs rounded font-medium border transition-colors ${
                            applicant.status === 'Rejected' 
                              ? 'bg-red-600 text-white border-red-600' 
                              : 'bg-white text-red-600 border-red-300 hover:bg-red-50'
                          }`}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI CANDIDATE ANALYSIS MODAL */}
      {selectedApplicant && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn'>
          <div className='bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-gray-200'>
            
            {/* Modal Header */}
            <div className='p-5 border-b border-gray-100 flex justify-between items-start bg-slate-50 sticky top-0 z-10'>
              <div className='flex items-center gap-4'>
                <img className='w-14 h-14 rounded-full object-cover border-2 border-blue-500 shadow-sm' src={selectedApplicant.userId.image} alt="" />
                <div>
                  <h2 className='text-xl font-bold text-gray-900'>{selectedApplicant.userId.name}</h2>
                  <p className='text-sm text-gray-500 font-medium'>
                    Applied for: <span className='text-blue-600 font-semibold'>{selectedApplicant.jobId?.title}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedApplicant(null)}
                className='text-gray-400 hover:text-gray-700 bg-white p-1.5 rounded-full border border-gray-200 shadow-sm'
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className='p-6 space-y-6'>
              
              {/* Score & Overview Header Card */}
              <div className='bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white p-5 rounded-xl flex flex-wrap justify-between items-center gap-4 shadow-md'>
                <div>
                  <div className='text-xs uppercase tracking-wider text-blue-300 font-semibold mb-1'>AI Matching Score</div>
                  <div className='flex items-baseline gap-2'>
                    <span className='text-4xl font-extrabold text-white'>
                      {selectedApplicant.aiAnalysis?.matchScore ?? 0}%
                    </span>
                    <span className='text-sm text-blue-200 font-medium'>Overall Candidate Fit</span>
                  </div>
                </div>

                <div className='flex gap-3 text-xs font-medium'>
                  <div className='bg-white/10 px-3 py-2 rounded-lg border border-white/10'>
                    <div className='text-gray-300 text-[10px] uppercase'>Experience</div>
                    <div className='text-emerald-400 font-bold text-sm'>{selectedApplicant.aiAnalysis?.experienceMatch || 'Moderate'}</div>
                  </div>
                  <div className='bg-white/10 px-3 py-2 rounded-lg border border-white/10'>
                    <div className='text-gray-300 text-[10px] uppercase'>Education</div>
                    <div className='text-emerald-400 font-bold text-sm'>{selectedApplicant.aiAnalysis?.educationMatch || 'Moderate'}</div>
                  </div>
                </div>

                <div className='flex items-center gap-2'>
                  <button
                    onClick={() => handleReanalyze(selectedApplicant._id)}
                    disabled={isAnalyzing}
                    className='bg-blue-600 hover:bg-blue-500 text-white text-xs px-3.5 py-2 rounded-lg font-medium transition-colors border border-blue-400/30'
                  >
                    {isAnalyzing ? 'Re-analyzing...' : '🔄 Re-Analyze'}
                  </button>
                </div>
              </div>

              {/* AI Summary Box */}
              <div className='bg-blue-50/70 border border-blue-200 rounded-xl p-4'>
                <h3 className='text-xs font-bold uppercase tracking-wider text-blue-800 mb-1 flex items-center gap-1.5'>
                  💡 AI Candidate Summary
                </h3>
                <p className='text-sm text-gray-700 leading-relaxed'>
                  {selectedApplicant.aiAnalysis?.summary || 'No AI summary available.'}
                </p>
              </div>

              {/* Skills Analysis Grid */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                
                {/* Matched Skills */}
                <div className='bg-emerald-50/40 border border-emerald-200/60 rounded-xl p-4'>
                  <h4 className='text-xs font-bold uppercase tracking-wider text-emerald-800 mb-2 flex items-center gap-1'>
                    ✓ Matched Skills ({selectedApplicant.aiAnalysis?.matchedSkills?.length || 0})
                  </h4>
                  <div className='flex flex-wrap gap-1.5'>
                    {selectedApplicant.aiAnalysis?.matchedSkills?.length > 0 ? (
                      selectedApplicant.aiAnalysis.matchedSkills.map((skill, i) => (
                        <span key={i} className='bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-md font-medium border border-emerald-300/50'>
                          ✓ {skill}
                        </span>
                      ))
                    ) : (
                      <span className='text-xs text-gray-400 italic'>No matched skills detected</span>
                    )}
                  </div>
                </div>

                {/* Missing Skills */}
                <div className='bg-rose-50/40 border border-rose-200/60 rounded-xl p-4'>
                  <h4 className='text-xs font-bold uppercase tracking-wider text-rose-800 mb-2 flex items-center gap-1'>
                    • Missing Skills ({selectedApplicant.aiAnalysis?.missingSkills?.length || 0})
                  </h4>
                  <div className='flex flex-wrap gap-1.5'>
                    {selectedApplicant.aiAnalysis?.missingSkills?.length > 0 ? (
                      selectedApplicant.aiAnalysis.missingSkills.map((skill, i) => (
                        <span key={i} className='bg-rose-100 text-rose-800 text-xs px-2.5 py-1 rounded-md font-medium border border-rose-300/50'>
                          • {skill}
                        </span>
                      ))
                    ) : (
                      <span className='text-xs text-gray-400 italic'>No key missing skills identified</span>
                    )}
                  </div>
                </div>

              </div>

              {/* Relevant Experience & Projects */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                
                <div className='border border-gray-200 rounded-xl p-4 bg-gray-50/50'>
                  <h4 className='text-xs font-bold uppercase tracking-wider text-gray-700 mb-2'>
                    💼 Relevant Experience
                  </h4>
                  {selectedApplicant.aiAnalysis?.relevantExperience?.length > 0 ? (
                    <ul className='list-disc list-inside text-xs text-gray-700 space-y-1.5'>
                      {selectedApplicant.aiAnalysis.relevantExperience.map((exp, i) => (
                        <li key={i}>{exp}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-xs text-gray-400 italic'>No relevant experience noted</p>
                  )}
                </div>

                <div className='border border-gray-200 rounded-xl p-4 bg-gray-50/50'>
                  <h4 className='text-xs font-bold uppercase tracking-wider text-gray-700 mb-2'>
                    🚀 Relevant Projects
                  </h4>
                  {selectedApplicant.aiAnalysis?.relevantProjects?.length > 0 ? (
                    <ul className='list-disc list-inside text-xs text-gray-700 space-y-1.5'>
                      {selectedApplicant.aiAnalysis.relevantProjects.map((proj, i) => (
                        <li key={i}>{proj}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-xs text-gray-400 italic'>No relevant projects noted</p>
                  )}
                </div>

              </div>

              {/* Gaps & Interview Focus */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                
                <div className='border border-amber-200 bg-amber-50/30 rounded-xl p-4'>
                  <h4 className='text-xs font-bold uppercase tracking-wider text-amber-800 mb-2'>
                    ⚠️ Potential Gaps
                  </h4>
                  {selectedApplicant.aiAnalysis?.potentialGaps?.length > 0 ? (
                    <ul className='list-disc list-inside text-xs text-amber-900 space-y-1.5'>
                      {selectedApplicant.aiAnalysis.potentialGaps.map((gap, i) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-xs text-gray-400 italic'>No significant gaps flagged</p>
                  )}
                </div>

                <div className='border border-purple-200 bg-purple-50/30 rounded-xl p-4'>
                  <h4 className='text-xs font-bold uppercase tracking-wider text-purple-800 mb-2'>
                    🎯 Recommended Interview Focus
                  </h4>
                  {selectedApplicant.aiAnalysis?.interviewFocus?.length > 0 ? (
                    <ul className='list-disc list-inside text-xs text-purple-900 space-y-1.5'>
                      {selectedApplicant.aiAnalysis.interviewFocus.map((focus, i) => (
                        <li key={i}>{focus}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-xs text-gray-400 italic'>No specific focus areas generated</p>
                  )}
                </div>

              </div>

              {/* AI INTERVIEW QUESTION GENERATOR (Section 13) */}
              <div className='border border-indigo-200 rounded-xl p-5 bg-indigo-50/30 space-y-3'>
                <div className='flex justify-between items-center flex-wrap gap-2'>
                  <div>
                    <h3 className='text-sm font-bold text-indigo-950 flex items-center gap-1.5'>
                      ✨ Tailored AI Interview Questions
                    </h3>
                    <p className='text-xs text-gray-500'>Generate candidate-specific technical & behavioral interview questions</p>
                  </div>
                  <button
                    onClick={() => handleGenerateQuestions(selectedApplicant._id)}
                    disabled={isGeneratingQuestions}
                    className='bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3.5 py-2 rounded-lg font-medium shadow-sm transition-colors'
                  >
                    {isGeneratingQuestions ? 'Generating...' : '✨ Generate Questions'}
                  </button>
                </div>

                {selectedApplicant.aiAnalysis?.interviewQuestions?.length > 0 && (
                  <div className='space-y-2 mt-3 pt-3 border-t border-indigo-100'>
                    {selectedApplicant.aiAnalysis.interviewQuestions.map((q, idx) => (
                      <div key={idx} className='bg-white p-3 rounded-lg border border-indigo-100 text-xs shadow-2xs space-y-1'>
                        <div className='flex items-center justify-between gap-2'>
                          <span className='font-bold text-indigo-900'>Q{idx + 1}. {q.question}</span>
                          <span className='bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded text-[10px] uppercase'>
                            {q.category}
                          </span>
                        </div>
                        {q.context && <p className='text-gray-500 italic text-[11px]'>Context: {q.context}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer / Recruiter Decision Controls */}
            <div className='p-5 border-t border-gray-100 bg-gray-50 flex justify-between items-center flex-wrap gap-3 rounded-b-xl sticky bottom-0 z-10'>
              <div className='flex items-center gap-2'>
                {selectedApplicant.userId.resume && (
                  <a
                    href={`${backendUrl}/api/users/resume/${selectedApplicant.userId._id}`}
                    target='_blank'
                    rel='noreferrer'
                    className='bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 text-xs font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5 shadow-2xs'
                  >
                    📄 View Original Resume
                  </a>
                )}
              </div>

              <div className='flex items-center gap-2'>
                <button
                  onClick={() => changeJobApplicationStatus(selectedApplicant._id, 'Accepted')}
                  className='bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5 py-2 rounded-lg shadow-sm transition-colors'
                >
                  ✓ Shortlist Candidate
                </button>
                <button
                  onClick={() => changeJobApplicationStatus(selectedApplicant._id, 'Rejected')}
                  className='bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-5 py-2 rounded-lg shadow-sm transition-colors'
                >
                  ✕ Reject Candidate
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  ) : <Loading />
}

export default ViewApplications