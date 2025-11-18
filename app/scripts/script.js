const imageInput = document.getElementById('imageInput');
const compressBtn = document.getElementById('compressBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const targetSizeInput = document.getElementById('targetSize');
const resultContainer = document.getElementById('result');

let processedResults = [];

imageInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  compressBtn.disabled = files.length === 0;
  processedResults = [];
  downloadAllBtn.style.display = 'none';
  if (files.length > 0) {
    const total = files.reduce((s, f) => s + f.size, 0);
    resultContainer.innerHTML = `<p>Выбрано: ${files.length} файлов (${(total / 1024).toFixed(1)} КБ)</p>`;
  } else {
    resultContainer.innerHTML = '';
  }
});

// Функция обрезки имени файла до n символов с сохранением расширения
function truncateFilename(filename, maxLength) {
  if (filename.length <= maxLength) return filename;
  const extMatch = filename.match(/\.[^/.]+$/);
  const ext = extMatch ? extMatch[0] : '';
  const nameWithoutExt = filename.slice(0, -ext.length);
  if (nameWithoutExt.length <= maxLength - 3 - ext.length) {
    return filename;
  }
  return nameWithoutExt.slice(0, maxLength - 3 - ext.length) + '...' + ext;
}

compressBtn.addEventListener('click', async () => {
  const files = Array.from(imageInput.files);
  if (!files.length) return;

  const targetKB = Number(targetSizeInput.value);
  if (!targetKB || targetKB <= 0) return alert('Укажите корректный размер');

  const targetBytes = targetKB * 1024;
  resultContainer.innerHTML = '<p>Обработка...</p>';
  processedResults = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    resultContainer.innerHTML = `<p>Обработка ${i + 1}/${files.length}: ${file.name}</p>`;

    try {
      const blob = await compressImage(file, targetBytes);
      const originalName = file.name;

      // Очищаем имя от небезопасных символов
      let cleanBaseName = originalName.replace(/\.[^/.]+$/, ''); // убираем расширение
      cleanBaseName = cleanBaseName
        .replace(/[\/\\:*?"<>|\[\]]/g, '_') // заменяем спецсимволы на _
        .replace(/\s+/g, '_')               // пробелы → _
        .replace(/_+/g, '_')                // множественные _ → одно
        .replace(/^_+|_+$/g, '');           // убираем _ в начале и конце

      // Ограничиваем длину до 50 символов
      if (cleanBaseName.length > 50) {
        cleanBaseName = cleanBaseName.slice(0, 47) + '...';
      }

      const ext = originalName.match(/\.[^/.]+$/)?.[0] || '.jpg';
      const fileName = `compressed_${cleanBaseName}${ext}`;

      processedResults.push({ originalName, fileName, blob });
    } catch (err) {
      console.error('Ошибка обработки', file.name, err);
      processedResults.push({ originalName: file.name, error: true });
    }
  }

  resultContainer.innerHTML = '<h3>Результаты:</h3>';
  processedResults.forEach(({ originalName, fileName, blob, error }) => {
    const div = document.createElement('div');
    div.className = 'result-item';

    if (error) {
      const truncated = truncateFilename(originalName, 30);
      div.innerHTML = `<strong>${truncated}</strong>: ошибка`;
    } else {
      const url = URL.createObjectURL(blob);
      const truncatedName = truncateFilename(fileName, 30);
      div.innerHTML = `
        <strong>${truncatedName}</strong> → ${(blob.size / 1024).toFixed(1)} КБ<br>
        <img src="${url}" />
        <a class="download-link" href="${url}" download="${fileName}">Скачать</a>
      `;
    }
    resultContainer.appendChild(div);
  });

  if (processedResults.some(r => !r.error)) {
    downloadAllBtn.style.display = 'block';
  }
});

downloadAllBtn.addEventListener('click', async () => {
  const zip = new JSZip();
  const validFiles = processedResults.filter(r => !r.error);

  for (const { fileName, blob } of validFiles) {
    zip.file(fileName, blob);
  }

  try {
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
                     String(now.getMonth() + 1).padStart(2, '0') +
                     String(now.getDate()).padStart(2, '0') + '_' +
                     String(now.getHours()).padStart(2, '0') +
                     String(now.getMinutes()).padStart(2, '0') +
                     String(now.getSeconds()).padStart(2, '0');
    const zipName = `images_${timestamp}.zip`;
    
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, zipName);
  } catch (err) {
    alert('Ошибка при создании архива');
    console.error(err);
  }
});

function compressImage(file, targetSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let quality = 0.95;
        let scale = 1;

        function step() {
          const w = Math.max(1, img.width * scale);
          const h = Math.max(1, img.height * scale);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);

          canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('Не удалось создать изображение'));
            if (blob.size <= targetSize || (quality < 0.05 && scale < 0.2)) {
              resolve(blob);
            } else if (quality > 0.05) {
              quality -= 0.06;
              step();
            } else {
              scale *= 0.9;
              step();
            }
          }, 'image/jpeg', quality);
        }
        step();
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}