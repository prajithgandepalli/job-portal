import { v2 as cloudinary } from 'cloudinary';

/**
 * Generates a short-lived Cloudinary signed URL so our server
 * can download private/restricted raw files (PDF, DOCX resumes).
 *
 * @param {string} cloudinaryUrl - The stored Cloudinary URL from MongoDB
 * @returns {string} Signed URL valid for 5 minutes, or the original URL on failure
 */
export const getAccessibleResumeUrl = (cloudinaryUrl) => {
    if (!cloudinaryUrl) return cloudinaryUrl;

    try {
        const url = new URL(cloudinaryUrl);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const resourceType = pathParts[1] || 'raw';
        const uploadIdx = pathParts.indexOf('upload');

        if (uploadIdx === -1) return cloudinaryUrl;

        let remaining = pathParts.slice(uploadIdx + 1);

        if (remaining.length > 0 && /^v\d+$/.test(remaining[0])) {
            remaining = remaining.slice(1);
        }

        let publicId;
        if (resourceType === 'raw') {
            publicId = remaining.join('/');
        } else {
            const joined = remaining.join('/');
            const lastDot = joined.lastIndexOf('.');
            publicId = lastDot !== -1 ? joined.substring(0, lastDot) : joined;
        }

        const signedUrl = cloudinary.url(publicId, {
            resource_type: resourceType,
            type: 'upload',
            sign_url: true,
            secure: true,
            flags: 'attachment',
            format: 'pdf',
            expires_at: Math.floor(Date.now() / 1000) + 300
        });

        return signedUrl;
    } catch (err) {
        console.warn('getAccessibleResumeUrl failed, using original URL:', err.message);
        return cloudinaryUrl;
    }
};
