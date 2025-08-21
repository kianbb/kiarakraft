'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  uploadProductImage,
  deleteProductImage,
  reorderProductImages,
  updateProductImageAlt,
} from '@/lib/actions/upload';
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
  maxImages = 5,
}: ImageUploadManagerProps) {
  const [images, setImages] = useState<ImageData[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingAltId, setEditingAltId] = useState<string | null>(null);
  const [altDraft, setAltDraft] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateImages = (newImages: ImageData[]) => {
    setImages(newImages);
    onImagesChange?.(newImages);
  };

  const validateClientFile = (file: File): string | null => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const max = 5 * 1024 * 1024; // 5MB
    if (!allowed.includes(file.type))
      return 'Invalid file type. Only JPEG, PNG, and WebP are allowed.';
    if (file.size > max) return 'File size too large. Maximum 5MB allowed.';
    return null;
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    if (images.length + list.length > maxImages) {
      toast.error(`Maximum ${maxImages} images allowed`);
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const err = validateClientFile(file);
        if (err) {
          toast.error(err);
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('productId', productId);

        const result = await uploadProductImage(formData);
        if (result.success && result.image) {
          updateImages([...images, result.image]);
        } else {
          toast.error(result.error || 'Upload failed');
        }

        setProgress(Math.round(((i + 1) / list.length) * 100));
      }
      if (list.length > 0) toast.success('Upload complete');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 400);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
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
      sortOrder: index + 1,
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

  const startEditAlt = (img: ImageData) => {
    setEditingAltId(img.id);
    setAltDraft(img.alt ?? '');
  };

  const saveAlt = async () => {
    if (!editingAltId) return;
    const result = await updateProductImageAlt(
      editingAltId,
      productId,
      altDraft.trim()
    );
    if (result.success) {
      const newImages = images.map(img =>
        img.id === editingAltId ? { ...img, alt: result.alt ?? '' } : img
      );
      updateImages(newImages);
      toast.success('Alt text updated');
      setEditingAltId(null);
      setAltDraft('');
    } else {
      toast.error(result.error || 'Failed to update alt');
    }
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
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragging ? 'border-primary bg-primary/5' : 'border-gray-300'
          }`}
          onDragEnter={e => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={e => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={e => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={e => {
            e.preventDefault();
            setIsDragging(false);
            if (uploading) return;
            const dtFiles = e.dataTransfer?.files;
            if (dtFiles && dtFiles.length) uploadFiles(dtFiles);
          }}
          aria-label="Upload product images"
        >
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
                Drag & drop or click to upload. JPEG, PNG, WebP up to 5MB each
              </p>

              {uploading && (
                <div className="mt-3 h-2 w-56 bg-gray-200 rounded">
                  <div
                    className="h-2 bg-primary rounded"
                    style={{ width: `${progress}%` }}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    role="progressbar"
                  />
                </div>
              )}
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
                onDrop={e => handleDrop(e, index)}
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

                {/* Alt editor overlay */}
                <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform">
                  <div className="bg-black/60 p-2 flex gap-2 items-center">
                    {editingAltId === image.id ? (
                      <>
                        <input
                          type="text"
                          value={altDraft}
                          onChange={e => setAltDraft(e.target.value)}
                          placeholder="Alt text (max 200 chars)"
                          maxLength={200}
                          className="flex-1 text-xs px-2 py-1 rounded bg-white text-black"
                        />
                        <Button size="sm" variant="secondary" onClick={saveAlt}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingAltId(null);
                            setAltDraft('');
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <div
                          className="flex-1 text-xs text-white truncate"
                          title={image.alt || ''}
                        >
                          {image.alt || 'No alt text'}
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => startEditAlt(image)}
                        >
                          Edit alt
                        </Button>
                      </>
                    )}
                  </div>
                </div>
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
