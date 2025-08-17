'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Upload, X, GripVertical, Loader2 } from 'lucide-react';

export interface UploadedImage {
  id: string;
  url: string;
  publicId?: string;
  alt?: string;
  sortOrder: number;
}

interface ImageUploadProps {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
  disabled?: boolean;
}

export function ImageUpload({ 
  images, 
  onImagesChange, 
  maxImages = 10,
  disabled = false 
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadImage = useCallback(async (file: File): Promise<UploadedImage> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload/image', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const result = await response.json();
    return {
      id: crypto.randomUUID(),
      url: result.url,
      publicId: result.publicId,
      alt: file.name,
      sortOrder: images.length
    };
  }, [images.length]);

  const handleFileSelect = useCallback(async (files: FileList) => {
    if (disabled || uploading) return;
    
    const filesArray = Array.from(files);
    const remainingSlots = maxImages - images.length;
    
    if (filesArray.length > remainingSlots) {
      alert(`You can only upload ${remainingSlots} more image(s).`);
      return;
    }

    setUploading(true);
    try {
      const uploadPromises = filesArray.map(uploadImage);
      const newImages = await Promise.all(uploadPromises);
      onImagesChange([...images, ...newImages]);
    } catch (error) {
      console.error('Upload error:', error);
      alert(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [images, onImagesChange, maxImages, disabled, uploading, uploadImage]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const removeImage = (id: string) => {
    const filtered = images.filter(img => img.id !== id);
    const reordered = filtered.map((img, index) => ({ ...img, sortOrder: index }));
    onImagesChange(reordered);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleDragOverItem = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newImages = [...images];
    const draggedImage = newImages[draggedIndex];
    
    // Remove dragged item
    newImages.splice(draggedIndex, 1);
    // Insert at new position
    newImages.splice(index, 0, draggedImage);
    
    // Update sort orders
    const reordered = newImages.map((img, idx) => ({ ...img, sortOrder: idx }));
    onImagesChange(reordered);
    setDraggedIndex(index);
  };

  const canUploadMore = images.length < maxImages;

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      {canUploadMore && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors"
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <div className="mt-4">
            <p className="text-sm text-gray-600">
              Drag and drop images here, or{' '}
              <button
                type="button"
                className="text-blue-600 hover:text-blue-500 font-medium"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || uploading}
              >
                browse
              </button>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              PNG, JPG, WebP up to 5MB each. {images.length}/{maxImages} uploaded.
            </p>
          </div>
          
          {uploading && (
            <div className="mt-4 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-gray-600">Uploading...</span>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((image, index) => (
            <div
              key={image.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOverItem(e, index)}
              className={`relative group cursor-move border rounded-lg overflow-hidden ${
                draggedIndex === index ? 'opacity-50' : ''
              }`}
            >
              <div className="aspect-square relative">
                <Image
                  src={image.url}
                  alt={image.alt || `Product image ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
              </div>
              
              {/* Drag Handle */}
              <div className="absolute top-2 left-2 bg-black/50 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="h-4 w-4 text-white" />
              </div>
              
              {/* Remove Button */}
              <button
                type="button"
                onClick={() => removeImage(image.id)}
                className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </button>
              
              {/* Sort Order Indicator */}
              <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length === 0 && (
        <p className="text-center text-gray-500 py-8">
          No images uploaded yet. Add some images to showcase your product.
        </p>
      )}
    </div>
  );
}