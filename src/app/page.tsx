'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export default function Home() {
  const [directory, setDirectory] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map());

  const handleDirectorySelect = async () => {
    try {
      // @ts-ignore - showDirectoryPicker is supported in modern browsers
      if ('showDirectoryPicker' in window) {
        // @ts-ignore
        const dirHandle = await window.showDirectoryPicker();
        setDirectoryHandle(dirHandle);
        setDirectory(dirHandle.name);
        setError('');
        
        // Read files from directory handle
        const imageFileMap = new Map<string, File>();
        const imageNames: string[] = [];
        const evaluatedFiles = new Set<string>();
        
        // Check for existing CSV to skip already evaluated images
        try {
          const csvHandle = await dirHandle.getFileHandle('results.csv');
          const csvFile = await csvHandle.getFile();
          const csvContent = await csvFile.text();
          const lines = csvContent.split('\n').slice(1); // Skip header
          lines.forEach(line => {
            const [imageName] = line.split(',');
            if (imageName && imageName.trim()) {
              evaluatedFiles.add(imageName.trim());
            }
          });
        } catch {
          // CSV doesn't exist yet, which is fine
        }
        
        for await (const [name, handle] of dirHandle) {
          if (handle.kind === 'file' && /\.(jpg|jpeg|png|gif)$/i.test(name)) {
            if (!evaluatedFiles.has(name)) {
              const file = await handle.getFile();
              imageFileMap.set(name, file);
              imageNames.push(name);
            }
          }
        }
        
        setImageFiles(imageFileMap);
        setImages(imageNames);
        setCurrentImageIndex(0);
      } else {
        fileInputRef.current?.click();
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError('Failed to select directory');
      }
    }
  };

  const handleDirectoryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      // @ts-ignore - webkitRelativePath is supported in modern browsers
      const path = file.webkitRelativePath;
      if (path) {
        const dirPath = path.split('/')[0];
        setDirectory(dirPath);
        setError('');
        
        // Process files from the file input
        const imageFileMap = new Map<string, File>();
        const imageNames: string[] = [];
        
        Array.from(files).forEach(file => {
          // @ts-ignore
          const relativePath = file.webkitRelativePath;
          const fileName = relativePath.split('/').pop();
          if (fileName && /\.(jpg|jpeg|png|gif)$/i.test(fileName)) {
            imageFileMap.set(fileName, file);
            imageNames.push(fileName);
          }
        });
        
        setImageFiles(imageFileMap);
        setImages(imageNames);
        setCurrentImageIndex(0);
      }
    }
  };


  const handleChoice = useCallback(async (choice: 'Y' | 'N') => {
    if (images.length === 0) return;

    const image = images[currentImageIndex];
    
    try {
      if (directoryHandle) {
        // Use File System Access API to write CSV
        let csvFileHandle;
        try {
          csvFileHandle = await directoryHandle.getFileHandle('results.csv');
        } catch {
          // File doesn't exist, create it
          csvFileHandle = await directoryHandle.getFileHandle('results.csv', { create: true });
          const writable = await csvFileHandle.createWritable();
          await writable.write('Image,Choice\n');
          await writable.close();
        }
        
        // Append to CSV
        const file = await csvFileHandle.getFile();
        const existingContent = await file.text();
        const writable = await csvFileHandle.createWritable();
        await writable.write(existingContent + `${image},${choice}\n`);
        await writable.close();
      } else {
        // For fallback file input method, save to localStorage temporarily
        const savedChoices = JSON.parse(localStorage.getItem('imageChoices') || '[]');
        savedChoices.push({ directory, image, choice, timestamp: new Date().toISOString() });
        localStorage.setItem('imageChoices', JSON.stringify(savedChoices));
        setError('Choice saved to browser storage. Use "Select Directory" for direct file saving.');
      }
      
      if (currentImageIndex < images.length - 1) {
        setCurrentImageIndex(currentImageIndex + 1);
      } else {
        setImages([]); // No more images
      }
    } catch (error) {
      console.error('Failed to save choice:', error);
      setError('Failed to save choice');
    }
  }, [directory, images, currentImageIndex, directoryHandle]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'y') {
        handleChoice('Y');
      } else if (event.key === 'n') {
        handleChoice('N');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleChoice]);


  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Image Labeling App</h1>

      <div className="mb-4">
        <label className="block mb-2">Directory Selection:</label>
        <div className="flex space-x-2 mb-2">
          <button 
            onClick={handleDirectorySelect}
            className="bg-green-500 text-white p-2 rounded"
          >
            Select Directory
          </button>
          <input
            ref={fileInputRef}
            type="file"
            // @ts-ignore - webkitdirectory is supported in modern browsers
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleDirectoryChange}
            className="hidden"
          />
        </div>
        {directory && (
          <div className="text-sm text-gray-600 mt-2">
            Selected directory: {directory}
          </div>
        )}
      </div>

      {error && <p className="text-red-500">{error}</p>}

      {images.length > 0 && currentImageIndex < images.length ? (
        <div>
          <div className="mb-2">
            <h2 className="text-lg font-semibold">Current Image:</h2>
            <p className="text-gray-600">{images[currentImageIndex]}</p>
            <p className="text-sm text-gray-500">Image {currentImageIndex + 1} of {images.length}</p>
          </div>
          <img
            src={
              imageFiles.has(images[currentImageIndex])
                ? URL.createObjectURL(imageFiles.get(images[currentImageIndex])!)
                : ''
            }
            alt={images[currentImageIndex]}
            className="max-w-full h-auto mb-4"
          />
          <div className="flex space-x-4">
            <button onClick={() => handleChoice('Y')} className="bg-green-500 text-white p-2">Yes (y)</button>
            <button onClick={() => handleChoice('N')} className="bg-red-500 text-white p-2">No (n)</button>
          </div>
        </div>
      ) : (
        <p>{directory ? 'No more images to label.' : 'Please select a directory to start labeling images.'}</p>
      )}
    </div>
  );
}
