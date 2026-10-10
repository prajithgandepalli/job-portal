import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { v2 as cloudinary } from 'cloudinary';

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');

let mammoth;
try {
    mammoth = require('mammoth');
} catch {
    mammoth = null;
}

const looksLikePdf = (buffer) => buffer && buffer.length > 4 && buffer.slice(0, 5).toString('utf-8') === '%PDF-';
const looksLikeZip = (buffer) => buffer && buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4B;
const looksLikeHtml = (buffer) => {
    const head = buffer.slice(0, 200).toString('utf-8').toLowerCase();
    return head.includes('<html') || head.includes('<!doctype');
};

export const looksLikeResumeText = (text) => {
    if (!text || text.length < 40) return false;
    const letters = (text.match(/[A-Za-z]/g) || []).length;
    return letters / Math.max(text.length, 1) > 0.25;
};

/**
 * Robust PDF text extractor supporting both pdf-parse v1 and v2
 */
const parsePdfBuffer = async (buffer) => {
    if (!looksLikePdf(buffer)) {
        throw new Error('Downloaded file is not a valid PDF (Cloudinary likely returned an error page).');
    }

    try {
        if (pdfParseModule.PDFParse) {
            const parser = new pdfParseModule.PDFParse({ data: new Uint8Array(buffer) });
            try {
                const result = await parser.getText();
                return result?.text || '';
            } finally {
                if (typeof parser.destroy === 'function') {
                    await parser.destroy();
                }
            }
        } else if (typeof pdfParseModule === 'function') {
            const data = await pdfParseModule(buffer);
            return data.text || '';
        } else if (pdfParseModule.default && typeof pdfParseModule.default === 'function') {
            const data = await pdfParseModule.default(buffer);
            return data.text || '';
        }
    } catch (err) {
        console.warn('PDF parsing error:', err.message);
        throw new Error('Could not parse resume PDF: ' + err.message);
    }

    throw new Error('No compatible PDF parser is available');
};

/**
 * Extracts public_id from Cloudinary URL (without file extension).
 */
export const extractPublicIdFromUrl = (cloudinaryUrl) => {
    if (!cloudinaryUrl) return null;
    try {
        const url = new URL(cloudinaryUrl);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const uploadIdx = pathParts.indexOf('upload');
        if (uploadIdx === -1) return null;

        let remaining = pathParts.slice(uploadIdx + 1);
        if (remaining.length > 0 && /^v\d+$/.test(remaining[0])) {
            remaining = remaining.slice(1);
        }

        const joined = remaining.join('/');
        const lastDot = joined.lastIndexOf('.');
        return lastDot !== -1 ? joined.substring(0, lastDot) : joined;
    } catch {
        return null;
    }
};

const fetchAsBuffer = async (url) => {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || looksLikeHtml(buffer)) return null;
    return buffer;
};

const unzipFirstFile = (zipBuffer) => {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries().filter((e) => !e.isDirectory);
    if (entries.length === 0) return null;
    return entries[0].getData();
};

/**
 * Downloads resume bytes from Cloudinary even when public delivery is restricted.
 */
export const downloadResumeBufferFromCloudinary = async (cloudinaryUrl) => {
    const publicId = extractPublicIdFromUrl(cloudinaryUrl);
    if (!publicId) {
        throw new Error('Could not extract Cloudinary public_id from URL: ' + cloudinaryUrl);
    }

    const isRawUrl = cloudinaryUrl.includes('/raw/');
    const resourceTypes = isRawUrl ? ['raw', 'image'] : ['image', 'raw'];
    const publicIds = [publicId, `${publicId}.pdf`];

    for (const resourceType of resourceTypes) {
        for (const id of publicIds) {
            try {
                const downloadUrl = cloudinary.utils.private_download_url(id, 'pdf', {
                    resource_type: resourceType,
                    type: 'upload',
                    attachment: false,
                    expires_at: Math.floor(Date.now() / 1000) + 120
                });
                const buffer = await fetchAsBuffer(downloadUrl);
                if (buffer && (looksLikePdf(buffer) || looksLikeZip(buffer))) {
                    return looksLikeZip(buffer) && !looksLikePdf(buffer) ? unzipFirstFile(buffer) : buffer;
                }
            } catch (err) {
                console.warn(`private_download_url failed (${resourceType}/${id}):`, err.message);
            }
        }
    }

    for (const resourceType of resourceTypes) {
        for (const id of publicIds) {
            try {
                const zipUrl = cloudinary.utils.download_archive_url({
                    public_ids: [id],
                    resource_type: resourceType,
                    target_format: 'zip'
                });
                const zipBuffer = await fetchAsBuffer(zipUrl);
                if (!zipBuffer) continue;
                const file = unzipFirstFile(zipBuffer);
                if (file && (looksLikePdf(file) || looksLikeZip(file))) {
                    return file;
                }
            } catch (err) {
                console.warn(`archive download failed (${resourceType}/${id}):`, err.message);
            }
        }
    }

    const direct = await fetchAsBuffer(cloudinaryUrl);
    if (direct && looksLikePdf(direct)) return direct;

    throw new Error('Could not download resume from Cloudinary. Please re-upload the PDF.');
};

/**
 * Extracts plain text from a local file path (from multer temp file).
 */
export const extractTextFromLocalFile = async (filePath, originalName = '') => {
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error('Local file not found: ' + filePath);
    }

    const buffer = fs.readFileSync(filePath);
    const lowerName = originalName.toLowerCase();

    let extracted = '';
    if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
        if (!mammoth) throw new Error('DOCX support is not available');
        const docxData = await mammoth.extractRawText({ buffer });
        extracted = docxData.value;
    } else {
        extracted = await parsePdfBuffer(buffer);
    }

    return cleanText(extracted);
};

/**
 * Extracts text from a resume URL (handles direct fetch and Cloudinary restricted delivery).
 */
export const extractTextFromResume = async (resumeUrl) => {
    if (!resumeUrl) {
        throw new Error('Resume URL is required');
    }

    let buffer = null;

    try {
        buffer = await fetchAsBuffer(resumeUrl);
        if (buffer && !looksLikePdf(buffer) && !looksLikeZip(buffer) && resumeUrl.includes('cloudinary')) {
            buffer = null;
        }
    } catch (err) {
        console.warn('Direct resume fetch failed:', err.message);
    }

    if (!buffer && resumeUrl.includes('cloudinary')) {
        buffer = await downloadResumeBufferFromCloudinary(resumeUrl);
    }

    if (!buffer) {
        throw new Error('Could not retrieve resume data buffer');
    }

    const lowerUrl = resumeUrl.toLowerCase();
    let extractedText = '';

    if ((lowerUrl.includes('.docx') || lowerUrl.includes('.doc')) && !looksLikePdf(buffer)) {
        if (!mammoth) throw new Error('DOCX support is not available');
        const docxData = await mammoth.extractRawText({ buffer });
        extractedText = docxData.value;
    } else {
        extractedText = await parsePdfBuffer(buffer);
    }

    return cleanText(extractedText);
};

/**
 * Best-effort resume text for AI: stored text, local cache, then Cloudinary.
 */
export const resolveResumeText = async (user) => {
    if (looksLikeResumeText(user.resumeText)) {
        return user.resumeText;
    }

    const localPath = path.join(process.cwd(), 'uploads', 'resumes', `${user._id}.pdf`);
    if (fs.existsSync(localPath)) {
        try {
            const text = await extractTextFromLocalFile(localPath, 'resume.pdf');
            if (looksLikeResumeText(text)) {
                user.resumeText = text;
                await user.save();
                return text;
            }
        } catch (err) {
            console.warn('Local resume text extraction failed:', err.message);
        }
    }

    if (user.resume) {
        const text = await extractTextFromResume(user.resume);
        if (looksLikeResumeText(text)) {
            user.resumeText = text;
            await user.save();
            return text;
        }
    }

    throw new Error('Could not extract readable text from the candidate resume. Ask them to re-upload a text-based PDF.');
};

const cleanText = (raw) => {
    let text = (raw || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length > 15000) text = text.substring(0, 15000);
    return text;
};

/**
 * Helper to strip HTML tags from Quill rich-text job descriptions.
 */
export const stripHtml = (htmlText) => {
    if (!htmlText) return '';
    return htmlText
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};
