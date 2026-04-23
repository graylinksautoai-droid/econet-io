import { processImage, validateFile } from '../utils/imagePipeline';

/**
 * Upload service - handles image upload with proper error handling
 */
export class UploadService {
  constructor() {
    this.uploadQueue = [];
    this.isUploading = false;
  }

  /**
   * Process and prepare image for upload
   */
  async prepareImage(file) {
    // Validate file first
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Process image with safe pipeline
    const processed = await processImage(file);
    
    return {
      file: processed.upload,
      preview: processed.preview,
      previewUrl: processed.previewUrl,
      originalName: file.name,
      originalSize: file.size,
      processedSize: processed.upload.size,
      compressionRatio: processed.upload.size / file.size
    };
  }

  /**
   * Upload image to API
   */
  async uploadImage(file, token, postText) {
    if (this.isUploading) {
      throw new Error('Upload already in progress');
    }

    this.isUploading = true;

    try {
      const formData = new FormData();
      formData.append('content', postText);
      formData.append('category', 'social');
      formData.append('severity', 'low');
      formData.append('image', file);

      console.log('UPLOAD SERVICE: Starting upload');
      console.log('UPLOAD SERVICE: File:', file.name, file.type, file.size);

      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      console.log('UPLOAD SERVICE: Response status:', response.status);
      console.log('UPLOAD SERVICE: Response ok:', response.ok);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('UPLOAD SERVICE: Upload successful');
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      console.error('UPLOAD SERVICE: Upload failed:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      this.isUploading = false;
    }
  }

  /**
   * Get upload status
   */
  getUploadStatus() {
    return {
      isUploading: this.isUploading,
      queueLength: this.uploadQueue.length
    };
  }
}

// Singleton instance
export const uploadService = new UploadService();
