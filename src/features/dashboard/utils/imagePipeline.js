import { progressiveSync } from "../../../services/progressiveSync";

/**
 * Safe image processing pipeline
 * Enforces strict separation: preview uses original, upload uses transcoded
 */
export async function processImage(file) {
  // Input validation
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Invalid file type');
  }

  if (file.size > 10 * 1024 * 1024) { // 10MB limit
    throw new Error('File too large');
  }

  let uploadFile = file; // Default to original file

  try {
    // Dependency validation
    if (!progressiveSync || !progressiveSync.transcode) {
      console.warn('progressiveSync service unavailable, using original file');
      return {
        preview: file,
        upload: file,
        previewUrl: await generatePreviewUrl(file)
      };
    }

    // Transcode with timeout protection
    const transcodedFile = await Promise.race([
      progressiveSync.transcode(file),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Transcode timeout')), 10000)
      )
    ]);

    // Validate transcoded file
    if (transcodedFile && 
        transcodedFile.type.includes('image') && 
        transcodedFile.size > 0 &&
        transcodedFile.size < 10 * 1024 * 1024) {
      
      // Only use compatible formats for upload
      if (transcodedFile.type === 'image/jpeg' || 
          transcodedFile.type === 'image/png' || 
          transcodedFile.type === 'image/gif') {
        uploadFile = transcodedFile;
        console.log('Using transcoded file for upload');
      } else {
        console.warn(`Unsupported transcoded format: ${transcodedFile.type}, using original`);
      }
    } else {
      console.warn('Transcoding failed, using original file');
    }

  } catch (error) {
    console.error('Image processing failed:', error);
    // Fallback to original file
    uploadFile = file;
  }

  // Generate preview URL (always from original file)
  const previewUrl = await generatePreviewUrl(file);

  return {
    preview: file,
    upload: uploadFile,
    previewUrl
  };
}

/**
 * Generate preview URL from file
 */
async function generatePreviewUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onloadend = () => {
      resolve(reader.result);
    };
    
    reader.onerror = (error) => {
      reject(new Error('Failed to generate preview'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Validate file for upload
 */
export function validateFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'File must be an image' };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { valid: false, error: 'File must be smaller than 10MB' };
  }

  return { valid: true };
}
