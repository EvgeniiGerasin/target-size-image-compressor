// ------------------------------------------------------
// ЭЛЕМЕНТЫ DOM
// ------------------------------------------------------
const imageInput = document.getElementById('imageInput');
const compressBtn = document.getElementById('compressBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const targetSizeInput = document.getElementById('targetSize');
const resultContainer = document.getElementById('result');

let processedResults = [];

// ------------------------------------------------------
// УТИЛИТЫ
// ------------------------------------------------------

// Обрезка имени файла
function truncateFilename(filename, maxLength) {
  if (filename.length <= maxLength) return filename;
  const extMatch = filename.match(/\.[^/.]+$/);
  const ext = extMatch ? extMatch[0] : '';
  const base = filename.slice(0, -ext.length);

  const maxBaseLength = maxLength - 3 - ext.length;
  return base.slice(0, maxBaseLength) + '...' + ext;
}

// Создание безопасного имени файла
function sanitizeFilename(originalName) {
  let clean = originalName.replace(/\.[^/.]+$/, '');
  clean = clean
    .replace(/[\/\\:*?"<>|\[\]]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (clean.length > 50) clean = clean.slice(0, 47) + '...';

  const ext = originalName.match(/\.[^/.]+$/)?.[0] || '.jpg';
  return `compressed_${clean}${ext}`;
}

// ------------------------------------------------------
// UI ЛОГИКА
// ------------------------------------------------------

function renderInitialSelection(files) {
  if (!files.length) {
    resultContainer.innerHTML = '';
    return;
  }

  const total = files.reduce((s, f) => s + f.size, 0);
  resultContainer.innerHTML = `
    <p>Выбрано: ${files.length} файлов (${(total / 1024).toFixed(1)} КБ)</p>
  `;
}

function showProcessingStatus(index, total, name) {
  resultContainer.innerHTML = `<p>Обработка ${index}/${total}: ${name}</p>`;
}

function renderResults(results) {
  resultContainer.innerHTML = '<h3>Результаты:</h3>';

  results.forEach(({ originalName, fileName, blob, error }) => {
    const div = document.createElement('div');
    div.className = 'result-item';

    if (error) {
      div.innerHTML = `<strong>${truncateFilename(originalName, 30)}</strong>: ошибка`;
    } else {
      const url = URL.createObjectURL(blob);
      div.innerHTML = `
        <strong>${truncateFilename(fileName, 30)}</strong> → ${(blob.size / 1024).toFixed(1)} КБ<br>
        <img src="${url}" />
        <a class="download-link" href="${url}" download="${fileName}">Скачать</a>
      `;
    }

    resultContainer.appendChild(div);
  });

  if (results.some(r => !r.error)) {
    downloadAllBtn.style.display = 'block';
  }
}

// ------------------------------------------------------
// ОБРАБОТКА ФАЙЛА
// ------------------------------------------------------

async function processSingleFile(file, targetBytes) {
  try {
    const blob = await compressImage(file, targetBytes);
    const safeName = sanitizeFilename(file.name);
    return { originalName: file.name, fileName: safeName, blob };
  } catch (err) {
    console.error('Ошибка обработки', file.name, err);
    return { originalName: file.name, error: true };
  }
}

// ------------------------------------------------------
// ОСНОВНАЯ ЛОГИКА КОМПРЕССИИ
// ------------------------------------------------------

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

// ------------------------------------------------------
// ОБРАБОТЧИКИ СОБЫТИЙ
// ------------------------------------------------------

imageInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);

  compressBtn.disabled = files.length === 0;
  processedResults = [];
  downloadAllBtn.style.display = 'none';

  renderInitialSelection(files);
});

compressBtn.addEventListener('click', async () => {
  const files = Array.from(imageInput.files);
  if (!files.length) return;

  const targetKB = parseFloat(targetSizeInput.value);
  if (Number.isNaN(targetKB) || targetKB <= 0) {
    return alert('Укажите корректный размер');
  }

  const targetBytes = targetKB * 1024;
  processedResults = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    showProcessingStatus(i + 1, files.length, file.name);

    const result = await processSingleFile(file, targetBytes);
    processedResults.push(result);
  }

  renderResults(processedResults);
});

downloadAllBtn.addEventListener('click', async () => {
  const zip = new JSZip();
  const validFiles = processedResults.filter(r => !r.error);

  for (const { fileName, blob } of validFiles) {
    zip.file(fileName, blob);
  }

  try {
    const now = new Date();
    const timestamp =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `images_${timestamp}.zip`);
  } catch (err) {
    alert('Ошибка при создании архива');
    console.error(err);
  }
});
