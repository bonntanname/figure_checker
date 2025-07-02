'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export default function Home() {
  const [directory, setDirectory] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map());
  const [labels, setLabels] = useState([
    { key: 'y', value: 'Y' },
    { key: 'n', value: 'N' }
  ]);
  const [settingsWindow, setSettingsWindow] = useState<Window | null>(null);

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
        const evaluatedFiles = new Set<string>();
        
        // Check for existing CSV to skip already evaluated images
        try {
          const csvHandle = await dirHandle.getFileHandle('results.csv');
          const csvFile = await csvHandle.getFile();
          const csvContent = await csvFile.text();
          const lines = csvContent.split('\n').slice(1); // Skip header
          lines.forEach((line: string) => {
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
      }
    }
  };


  const handleChoice = useCallback(async (choice: string) => {
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
        <button 
          onClick={openSettingsWindow}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Settings
        </button>
      </div>


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

      {images.length > 0 && currentImageIndex < images.length ? (
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
            className="max-w-full h-auto mb-4"
          />
          <div className="flex flex-wrap gap-3">
            {labels.map((label, index) => (
              <button 
                key={`${label.key}-${label.value}`}
                onClick={() => handleChoice(label.value)} 
                className={`text-white p-2 px-4 rounded ${
                  index === 0 ? 'bg-green-500 hover:bg-green-600' : 
                  index === 1 ? 'bg-red-500 hover:bg-red-600' :
                  index === 2 ? 'bg-blue-500 hover:bg-blue-600' :
                  index === 3 ? 'bg-yellow-500 hover:bg-yellow-600' :
                  index === 4 ? 'bg-purple-500 hover:bg-purple-600' :
                  'bg-gray-500 hover:bg-gray-600'
                }`}
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
  );
}
