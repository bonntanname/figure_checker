'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const getLabelColors = (index: number) => {
  const colors = [
    { bg: 'bg-green-500 hover:bg-green-600', text: 'text-green-600' },
    { bg: 'bg-red-500 hover:bg-red-600', text: 'text-red-600' },
    { bg: 'bg-blue-500 hover:bg-blue-600', text: 'text-blue-600' },
    { bg: 'bg-yellow-500 hover:bg-yellow-600', text: 'text-yellow-600' },
    { bg: 'bg-purple-500 hover:bg-purple-600', text: 'text-purple-600' },
  ];
  return colors[index] || { bg: 'bg-gray-500 hover:bg-gray-600', text: 'text-gray-600' };
};

export default function Home() {
  const [directory, setDirectory] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map());
  const [labels, setLabels] = useState([
    { key: 'y', value: 'Y' },
    { key: 'n', value: 'N' }
  ]);
  const [settingsWindow, setSettingsWindow] = useState<Window | null>(null);
  const [imageChoices, setImageChoices] = useState<Map<string, string>>(new Map());

  const handleDirectorySelect = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        // @ts-expect-error - showDirectoryPicker not in TypeScript definitions
        const dirHandle = await window.showDirectoryPicker();
        setDirectoryHandle(dirHandle);
        setDirectory(dirHandle.name);
        setError('');
        
        // Read files from directory handle
        const imageFileMap = new Map<string, File>();
        const imageNames: string[] = [];
        
        for await (const [name, handle] of dirHandle) {
          if (handle.kind === 'file' && /\.(jpg|jpeg|png|gif)$/i.test(name)) {
            const file = await handle.getFile();
            imageFileMap.set(name, file);
            imageNames.push(name);
          }
        }
        
        setImageFiles(imageFileMap);
        setImages(imageNames);
        setCurrentImageIndex(0);
        setImageChoices(new Map());
      } else {
        fileInputRef.current?.click();
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError('Failed to select directory');
      }
    }
  };

  const handleDirectoryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const path = (file as File & { webkitRelativePath: string }).webkitRelativePath;
      if (path) {
        const dirPath = path.split('/')[0];
        setDirectory(dirPath);
        setError('');
        
        // Process files from the file input
        const imageFileMap = new Map<string, File>();
        const imageNames: string[] = [];
        
        Array.from(files).forEach(file => {
          const relativePath = (file as File & { webkitRelativePath: string }).webkitRelativePath;
          const fileName = relativePath.split('/').pop();
          if (fileName && /\.(jpg|jpeg|png|gif)$/i.test(fileName)) {
            imageFileMap.set(fileName, file);
            imageNames.push(fileName);
          }
        });
        
        setImageFiles(imageFileMap);
        setImages(imageNames);
        setCurrentImageIndex(0);
        setImageChoices(new Map());
      }
    }
  };


  const handleChoice = useCallback((choice: string) => {
    if (images.length === 0) return;

    const image = images[currentImageIndex];
    
    // Update image choices
    setImageChoices(prev => new Map(prev.set(image, choice)));
    
    // Move to next image or cycle back to first
    const nextIndex = currentImageIndex < images.length - 1 ? currentImageIndex + 1 : 0;
    setCurrentImageIndex(nextIndex);
    
    // Scroll to the next image in Timeline
    setTimeout(() => {
      if (timelineRef.current) {
        const timelineItems = timelineRef.current.children;
        if (timelineItems[nextIndex]) {
          timelineItems[nextIndex].scrollIntoView({
            behavior: 'instant',
            block: 'start'
          });
        }
      }
    }, 0);
  }, [images, currentImageIndex]);

  const saveCsv = useCallback(async () => {
    if (imageChoices.size === 0) {
      setError('No choices to save');
      return;
    }

    try {
      // Generate date-based filename
      const now = new Date();
      const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD format
      const filename = `results-${dateString}.csv`;
      
      if (directoryHandle) {
        // Use File System Access API to write CSV
        const csvFileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        const writable = await csvFileHandle.createWritable();
        
        // Write header
        await writable.write('Image,Choice\n');
        
        // Write all choices
        for (const [image, choice] of imageChoices) {
          await writable.write(`${image},${choice}\n`);
        }
        
        await writable.close();
        setError('CSV saved successfully');
      } else {
        // Fallback: download CSV file
        const csvContent = 'Image,Choice\n' + 
          Array.from(imageChoices.entries())
            .map(([image, choice]) => `${image},${choice}`)
            .join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        setError('CSV downloaded successfully');
      }
    } catch (error) {
      console.error('Failed to save CSV:', error);
      setError('Failed to save CSV');
    }
  }, [imageChoices, directoryHandle]);

  const processCsvFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setError('Invalid CSV format');
        return;
      }
      
      // Parse CSV (skip header)
      const newChoices = new Map<string, string>();
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const [imageName, choice] = line.split(',');
          if (imageName && choice) {
            newChoices.set(imageName.trim(), choice.trim());
          }
        }
      }
      
      setImageChoices(newChoices);
      
      // Set current image index to first unselected image
      const firstUnselectedIndex = images.findIndex(image => !newChoices.has(image));
      if (firstUnselectedIndex !== -1) {
        setCurrentImageIndex(firstUnselectedIndex);
      } else {
        // All images are selected, go to first image
        setCurrentImageIndex(0);
      }
      
      setError(`CSV loaded successfully. ${newChoices.size} choices loaded.`);
    } catch (error) {
      console.error('Failed to process CSV:', error);
      setError('Failed to process CSV');
    }
  }, [images]);

  const loadCsv = useCallback(async () => {
    try {
      if (directoryHandle) {
        // Find the most recent results-*.csv file
        const csvFiles: { name: string; handle: FileSystemFileHandle }[] = [];
        
        // @ts-expect-error - FileSystemDirectoryHandle async iterator
        for await (const [name, handle] of directoryHandle) {
          if (handle.kind === 'file' && /^results-\d{4}-\d{2}-\d{2}\.csv$/.test(name)) {
            csvFiles.push({ name, handle });
          }
        }
        
        // Sort by date (newest first)
        csvFiles.sort((a, b) => b.name.localeCompare(a.name));
        
        // Show file picker with default suggestion
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.multiple = false;
        
        input.onchange = async (event) => {
          const file = (event.target as HTMLInputElement).files?.[0];
          if (file) {
            await processCsvFile(file);
          }
        };
        
        // If we have a recent CSV file, suggest it
        if (csvFiles.length > 0) {
          const recentFile = await csvFiles[0].handle.getFile();
          
          // For File System Access API, we can directly process the most recent file
          // or let user choose
          const userWantsRecent = confirm(`Load most recent CSV file: ${csvFiles[0].name}?`);
          if (userWantsRecent) {
            await processCsvFile(recentFile);
            return;
          }
        }
        
        input.click();
      } else {
        // Fallback: regular file picker
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.multiple = false;
        
        input.onchange = async (event) => {
          const file = (event.target as HTMLInputElement).files?.[0];
          if (file) {
            await processCsvFile(file);
          }
        };
        
        input.click();
      }
    } catch (error) {
      console.error('Failed to load CSV:', error);
      setError('Failed to load CSV');
    }
  }, [directoryHandle, processCsvFile]);

  const goToNextUnselected = useCallback(() => {
    const firstUnselectedIndex = images.findIndex(image => !imageChoices.has(image));
    if (firstUnselectedIndex !== -1) {
      setCurrentImageIndex(firstUnselectedIndex);
      
      // Scroll to the unselected image in Timeline
      setTimeout(() => {
        if (timelineRef.current) {
          const timelineItems = timelineRef.current.children;
          if (timelineItems[firstUnselectedIndex]) {
            timelineItems[firstUnselectedIndex].scrollIntoView({
              behavior: 'instant',
              block: 'start'
            });
          }
        }
      }, 0);
    }
  }, [images, imageChoices]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const matchedLabel = labels.find(label => 
        label.key.toLowerCase() === event.key.toLowerCase()
      );
      if (matchedLabel) {
        handleChoice(matchedLabel.value);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleChoice, labels]);

  const openSettingsWindow = () => {
    if (settingsWindow && !settingsWindow.closed) {
      settingsWindow.focus();
      return;
    }

    const popup = window.open(
      '',
      'settings',
      'width=600,height=500,scrollbars=yes,resizable=yes,left=' + 
      (screen.width / 2 - 300) + ',top=' + (screen.height / 2 - 250)
    );

    if (!popup) {
      alert('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
      return;
    }

    setSettingsWindow(popup);

    popup.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Label Settings</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; }
          </style>
        </head>
        <body class="p-6 bg-gray-50">
          <div class="max-w-lg mx-auto bg-white rounded-lg shadow-lg p-6">
            <h2 class="text-xl font-bold mb-4 text-gray-800">Label Settings</h2>
            
            <div class="mb-4">
              <p class="text-sm text-gray-600 mb-2">
                キーボードショートカット（Key）と保存される値（CSV Value）を設定してください
              </p>
            </div>

            <div id="options-container" class="space-y-3">
              ${labels.map((label, index) => `
                <div class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50" data-index="${index}">
                  <div class="flex-1">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Keyboard Key</label>
                    <input
                      type="text"
                      placeholder="e.g., y"
                      value="${label.key}"
                      class="option-key w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-mono"
                      maxlength="1"
                    />
                  </div>
                  <div class="flex-1">
                    <label class="block text-xs font-medium text-gray-600 mb-1">CSV Value</label>
                    <input
                      type="text"
                      placeholder="e.g., Y"
                      value="${label.value}"
                      class="option-value w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onclick="removeOption(${index})"
                    class="text-red-500 hover:text-red-700 p-2 mt-5"
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
              `).join('')}
            </div>
            
            <div class="mt-4">
              <button
                onclick="addOption()"
                class="w-full px-4 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded hover:border-gray-400 hover:text-gray-700"
              >
                + オプションを追加
              </button>
            </div>
            
            <div class="flex justify-end space-x-2 mt-6">
              <button
                onclick="window.close()"
                class="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onclick="saveSettings()"
                class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Save
              </button>
            </div>
          </div>

          <script>
            let optionCount = ${labels.length};

            function addOption() {
              const container = document.getElementById('options-container');
              const newIndex = optionCount++;
              const optionHtml = \`
                <div class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50" data-index="\${newIndex}">
                  <div class="flex-1">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Keyboard Key</label>
                    <input
                      type="text"
                      placeholder="e.g., g"
                      value=""
                      class="option-key w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-mono"
                      maxlength="1"
                    />
                  </div>
                  <div class="flex-1">
                    <label class="block text-xs font-medium text-gray-600 mb-1">CSV Value</label>
                    <input
                      type="text"
                      placeholder="e.g., Good"
                      value=""
                      class="option-value w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onclick="removeOption(\${newIndex})"
                    class="text-red-500 hover:text-red-700 p-2 mt-5"
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
              \`;
              container.insertAdjacentHTML('beforeend', optionHtml);
            }

            function removeOption(index) {
              const option = document.querySelector(\`[data-index="\${index}"]\`);
              if (option && document.querySelectorAll('#options-container > div').length > 1) {
                option.remove();
              } else if (document.querySelectorAll('#options-container > div').length === 1) {
                alert('最低1つのオプションは必要です');
              }
            }

            function saveSettings() {
              const options = document.querySelectorAll('#options-container > div');
              const newLabels = [];
              
              options.forEach(option => {
                const key = option.querySelector('.option-key').value.trim();
                const value = option.querySelector('.option-value').value.trim();
                
                if (key && value) {
                  newLabels.push({ key, value });
                }
              });
              
              if (newLabels.length === 0) {
                alert('少なくとも1つの有効なオプションを設定してください');
                return;
              }
              
              // Check for duplicate keys
              const keys = newLabels.map(label => label.key.toLowerCase());
              const uniqueKeys = [...new Set(keys)];
              if (keys.length !== uniqueKeys.length) {
                alert('キーボードキーが重複しています。異なるキーを設定してください');
                return;
              }
              
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: 'saveSettings', labels: newLabels }, '*');
              }
              
              window.close();
            }
          </script>
        </body>
      </html>
    `);

    popup.document.close();
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'saveSettings') {
        setLabels(event.data.labels);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    return () => {
      if (settingsWindow && !settingsWindow.closed) {
        settingsWindow.close();
      }
    };
  }, [settingsWindow]);


  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Image Labeling App</h1>
        <div className="flex gap-2">
          <button 
            onClick={loadCsv}
            disabled={images.length === 0}
            className="bg-orange-500 text-white px-4 py-2 rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Load CSV
          </button>
          <button 
            onClick={saveCsv}
            disabled={imageChoices.size === 0}
            className="bg-green-500 text-white px-4 py-2 rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Save CSV
          </button>
          <button 
            onClick={openSettingsWindow}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Settings
          </button>
        </div>
      </div>
      
      <div className="flex gap-4">
        {/* Main content area */}
        <div className="flex-1">


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
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
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

      {images.length > 0 ? (
        <div>
          <div className="mb-2">
            <h2 className="text-lg font-semibold">Current Image:</h2>
            <p className="text-gray-600">{images[currentImageIndex]}</p>
            <p className="text-sm text-gray-500">Image {currentImageIndex + 1} of {images.length}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              imageFiles.has(images[currentImageIndex])
                ? URL.createObjectURL(imageFiles.get(images[currentImageIndex])!)
                : ''
            }
            alt={images[currentImageIndex]}
            className="max-w-full max-h-[70vh] object-contain mb-4"
          />
          <div className="flex flex-wrap gap-3">
            {labels.map((label, index) => (
              <button 
                key={`${label.key}-${label.value}`}
                onClick={() => handleChoice(label.value)} 
                className={`text-white p-2 px-4 rounded ${getLabelColors(index).bg}`}
              >
                {label.value} ({label.key})
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p>{directory ? 'No more images to label.' : 'Please select a directory to start labeling images.'}</p>
      )}
        </div>
        
        {/* Timeline area */}
        {images.length > 0 && (
          <div className="w-80 bg-gray-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">Timeline</h2>
            <div ref={timelineRef} className="space-y-2 max-h-[600px] overflow-y-auto">
              {images.map((image, index) => (
                <div 
                  key={image}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-100 ${
                    index === currentImageIndex 
                      ? 'border-2 border-blue-500 bg-blue-50' 
                      : 'border border-gray-200 bg-white'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-12 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        imageFiles.has(image)
                          ? URL.createObjectURL(imageFiles.get(image)!)
                          : ''
                      }
                      alt={image}
                      className="w-full h-full object-cover rounded"
                    />
                  </div>
                  
                  {/* Image info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{image}</p>
                    <p className="text-xs text-gray-500">
                      {imageChoices.has(image) ? (
                        <span className={`font-medium ${
                          (() => {
                            const choice = imageChoices.get(image);
                            const labelIndex = labels.findIndex(label => label.value === choice);
                            return getLabelColors(labelIndex).text;
                          })()
                        }`}>
                          Choice: {imageChoices.get(image)}
                        </span>
                      ) : (
                        <span className="text-gray-400">Not selected</span>
                      )}
                    </p>
                  </div>
                  
                  {/* Index indicator */}
                  <div className="text-xs text-gray-400">
                    {index + 1}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <button 
                onClick={goToNextUnselected}
                disabled={images.length === 0 || images.every(image => imageChoices.has(image))}
                className="w-full bg-purple-500 text-white px-4 py-2 rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Jump to Unselected Figure
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
