'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { uploadProductImage, deleteProductImage, reorderProductImages } from '@/lib/actions/upload';
import { Upload, X, GripVertical, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';

interface ImageData {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
}

interface ImageUploadManagerProps {
  productId: string;
  initialImages: ImageData[];
  onImagesChange?: (images: ImageData[]) => void;
  maxImages?: number;
}

export default function ImageUploadManager({ 
  productId, 
  initialImages, 
  onImagesChange,
  maxImages = 5 
}: ImageUploadManagerProps) {
  const [images, setImages] = useState<ImageData[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateImages = (newImages: ImageData[]) => {
    setImages(newImages);
    onImagesChange?.(newImages);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > maxImages) {
      toast.error(`Maximum ${maxImages} images allowed`);
      return;
    }

    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('productId', productId);

        const result = await uploadProductImage(formData);
        
        if (result.success && result.image) {
          updateImages([...images, result.image]);
          toast.success('Image uploaded successfully');
        } else {
          toast.error(result.error || 'Upload failed');
        }
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (imageId: string) => {
    const result = await deleteProductImage(imageId, productId);
    
    if (result.success) {
      updateImages(images.filter(img => img.id !== imageId));
      toast.success('Image deleted');
    } else {
      toast.error(result.error || 'Delete failed');
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = async (event: React.DragEvent, dropIndex: number) => {
    event.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    const newImages = [...images];
    const draggedImage = newImages[draggedIndex];
    
    // Remove from old position
    newImages.splice(draggedIndex, 1);
    
    // Insert at new position
    newImages.splice(dropIndex, 0, draggedImage);
    
    // Update sort orders
    const reorderedImages = newImages.map((img, index) => ({
      ...img,
      sortOrder: index + 1
    }));
    
    updateImages(reorderedImages);
    
    // Save new order to database
    const imageIds = reorderedImages.map(img => img.id);
    const result = await reorderProductImages(productId, imageIds);
    
    if (result.success) {
      toast.success('Images reordered');
    } else {
      toast.error('Failed to save order');
      // Revert on error
      updateImages(images);
    }
    
    setDraggedIndex(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Product Images</h3>
        <div className="text-sm text-muted-foreground">
          {images.length} / {maxImages} images
        </div>
      </div>

      {/* Upload Area */}
      {images.length < maxImages && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />
          
          <div className="flex flex-col items-center gap-2">
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            ) : (
              <Upload className="h-8 w-8 text-gray-400" />
            )}
            
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Choose Images'}
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                JPEG, PNG, WebP up to 5MB each
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((image, index) => (
              <div
                key={image.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                className={`relative group bg-gray-100 rounded-lg overflow-hidden aspect-square cursor-move ${
                  draggedIndex === index ? 'opacity-50' : ''
                }`}
              >
                <Image
                  src={image.url}
                  alt={image.alt || 'Product image'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 33vw"
                />
                
                {/* Drag handle */}
                <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/50 rounded p-1">
                    <GripVertical className="h-4 w-4 text-white" />
                  </div>
                </div>
                
                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleDelete(image.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
                
                {/* Primary indicator */}
                {index === 0 && (
                  <div className="absolute bottom-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                    Primary
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
      
      {images.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No images uploaded yet
        </div>
      )}
    </div>
  );
}