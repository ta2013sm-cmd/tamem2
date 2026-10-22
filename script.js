// PDF.js setup
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

// مسار ملف الـ PDF مباشرة (بدل Base64)
const PDF_URL = 'math_book.pdf';

let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');

// Drawing canvas setup
const drawingCanvas = document.getElementById('drawingCanvas');
const drawingCtx = drawingCanvas.getContext('2d');
let isDrawing = false;
let penEnabled = false;
let penColor = '#ff0000';
let penSize = 3;

// Sidebar toggle (for the main tools sidebar)
document.getElementById('toggleSidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

document.getElementById('closeSidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
});

// === الخلفية المتحركة بالرموز الرياضية ===
(function createMathBackground() {
    const symbols = ['+', '−', '×', '÷', '=', '²', '³', '√', 'π', '%', '∞', '≠', '≤', '≥'];
    const container = document.getElementById('mathBg');
    const count = 30;

    for (let i = 0; i < count; i++) {
        const el = document.createElement('span');
        el.className = 'math-symbol';
        el.textContent = symbols[Math.floor(Math.random() * symbols.length)];

        const left = Math.random() * 100;
        const duration = 8 + Math.random() * 14; // 8s to 22s
        const delay = -(Math.random() * duration); // start at random point
        const size = 1.5 + Math.random() * 3; // 1.5rem to 4.5rem
        const opacity = 0.06 + Math.random() * 0.14;

        el.style.cssText = `
            left: ${left}%;
            font-size: ${size}rem;
            animation-duration: ${duration}s;
            animation-delay: ${delay}s;
            color: rgba(102, 126, 234, ${opacity});
        `;
        container.appendChild(el);
    }
})();

// === إدارة الدفتر ===
let notebookLocked = false;

document.getElementById('toggleNotebook').addEventListener('click', () => {
    document.getElementById('notebookPopup').classList.add('open');
    initNotebook();
});

document.getElementById('closeNotebook').addEventListener('click', () => {
    if (notebookLocked) return; // مقفول، لا يُغلق
    const popup = document.getElementById('notebookPopup');
    // أعِد ضبط الـ inline styles حتى يعمل الـ CSS class بشكل صحيح
    popup.style.left = '';
    popup.style.top = '';
    popup.style.transform = '';
    popup.classList.remove('open');
});

// زر القفل
document.getElementById('lockNotebook').addEventListener('click', () => {
    notebookLocked = !notebookLocked;
    const btn = document.getElementById('lockNotebook');
    if (notebookLocked) {
        btn.textContent = '🔒';
        btn.classList.add('locked');
        btn.title = 'الدفتر مقفول - اضغط لفتح القفل';
    } else {
        btn.textContent = '🔓';
        btn.classList.remove('locked');
        btn.title = 'قفل الدفتر';
    }
});

// Make notebook popup draggable
const notebookPopup = document.getElementById('notebookPopup');
const notebookHeader = document.getElementById('notebookHeader');
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

notebookHeader.addEventListener('mousedown', (e) => {
    isDragging = true;
    e.preventDefault();

    // احسب الموضع الحقيقي للنافذة على الشاشة (يأخذ transform بعين الاعتبار)
    const rect = notebookPopup.getBoundingClientRect();

    // حوّل الموضع إلى px صريح وأزل transform
    notebookPopup.style.left = rect.left + 'px';
    notebookPopup.style.top  = rect.top  + 'px';
    notebookPopup.style.transform = 'none';

    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    notebookHeader.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();

    const newX = e.clientX - dragOffsetX;
    const newY = e.clientY - dragOffsetY;

    // احتجاز الدفتر داخل حدود الشاشة
    const maxX = window.innerWidth  - notebookPopup.offsetWidth;
    const maxY = window.innerHeight - notebookPopup.offsetHeight;

    notebookPopup.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
    notebookPopup.style.top  = Math.max(0, Math.min(newY, maxY)) + 'px';
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    notebookHeader.style.cursor = 'grab';
});

notebookHeader.style.cursor = 'grab';

// Notebook setup
const notebookCanvas = document.getElementById('notebookCanvas');
const notebookCtx = notebookCanvas.getContext('2d');
const gridCanvas = document.getElementById('gridCanvas');
const gridCtx = gridCanvas.getContext('2d');
let notebookDrawing = false;
let notebookPenColor = '#000000';
let notebookPenSize = 2;
let notebookLastX = 0;
let notebookLastY = 0;
let notebookStartX = 0;
let notebookStartY = 0;
let notebookCurrentTool = 'pen';
let notebookTempCanvas = null;
let notebookTempCtx = null;
let gridVisible = true;

function initNotebook() {
    // Set canvas size - even larger
    const container = document.querySelector('.notebook-paper');
    notebookCanvas.width = Math.min(1200, window.innerWidth * 0.95);
    notebookCanvas.height = Math.min(800, window.innerHeight * 0.75);
    gridCanvas.width = notebookCanvas.width;
    gridCanvas.height = notebookCanvas.height;
    
    // Create temp canvas for shape preview
    notebookTempCanvas = document.createElement('canvas');
    notebookTempCanvas.width = notebookCanvas.width;
    notebookTempCanvas.height = notebookCanvas.height;
    notebookTempCtx = notebookTempCanvas.getContext('2d');
    
    // Load saved grid visibility
    const savedGrid = localStorage.getItem('notebookGridVisible');
    if (savedGrid === 'false') {
        gridVisible = false;
        document.getElementById('toggleGrid').textContent = 'إظهار';
    }
    
    // Draw grid on separate canvas
    if (gridVisible) {
        drawGrid();
    } else {
        gridCtx.fillStyle = '#ffffff';
        gridCtx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);
    }
    
    // Load saved drawing
    const savedDrawing = localStorage.getItem('notebookDrawing');
    if (savedDrawing) {
        const img = new Image();
        img.onload = () => {
            notebookCtx.drawImage(img, 0, 0);
        };
        img.src = savedDrawing;
    }
}

function drawGrid() {
    const gridSize = 20;
    gridCtx.fillStyle = '#ffffff';
    gridCtx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);
    
    gridCtx.strokeStyle = '#999999';
    gridCtx.lineWidth = 2;
    
    // Draw vertical lines
    for (let x = 0; x <= gridCanvas.width; x += gridSize) {
        gridCtx.beginPath();
        gridCtx.moveTo(x, 0);
        gridCtx.lineTo(x, gridCanvas.height);
        gridCtx.stroke();
    }
    
    // Draw horizontal lines
    for (let y = 0; y <= gridCanvas.height; y += gridSize) {
        gridCtx.beginPath();
        gridCtx.moveTo(0, y);
        gridCtx.lineTo(gridCanvas.width, y);
        gridCtx.stroke();
    }
}

function saveNotebookDrawing() {
    localStorage.setItem('notebookDrawing', notebookCanvas.toDataURL());
}

// Notebook drawing functions
function startNotebookDrawing(e) {
    notebookDrawing = true;
    const rect = notebookCanvas.getBoundingClientRect();
    notebookStartX = e.clientX - rect.left;
    notebookStartY = e.clientY - rect.top;
    notebookLastX = notebookStartX;
    notebookLastY = notebookStartY;
    
    // Save current canvas state for shapes
    if (notebookCurrentTool !== 'pen') {
        notebookTempCtx.drawImage(notebookCanvas, 0, 0);
    }
}

function stopNotebookDrawing() {
    if (notebookDrawing) {
        notebookDrawing = false;
        notebookCtx.beginPath();
        saveNotebookDrawing(); // Save when drawing stops
    }
}

function drawOnNotebook(e) {
    if (!notebookDrawing) return;
    
    const rect = notebookCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (notebookCurrentTool === 'eraser') {
        // Eraser tool - size depends on slider
        notebookCtx.globalCompositeOperation = 'destination-out';
        notebookCtx.lineWidth = notebookPenSize * 10; // Eraser is 10x larger
        notebookCtx.lineCap = 'round';
        
        notebookCtx.beginPath();
        notebookCtx.moveTo(notebookLastX, notebookLastY);
        notebookCtx.lineTo(x, y);
        notebookCtx.stroke();
        
        notebookCtx.globalCompositeOperation = 'source-over'; // Reset
        notebookLastX = x;
        notebookLastY = y;
    } else {
        notebookCtx.lineWidth = notebookPenSize;
        notebookCtx.lineCap = 'round';
        notebookCtx.strokeStyle = notebookPenColor;
        
        if (notebookCurrentTool === 'pen') {
            // Freehand drawing
            notebookCtx.beginPath();
            notebookCtx.moveTo(notebookLastX, notebookLastY);
            notebookCtx.lineTo(x, y);
            notebookCtx.stroke();
            
            notebookLastX = x;
            notebookLastY = y;
        } else {
            // Shape drawing - restore temp canvas and draw shape
            notebookCtx.clearRect(0, 0, notebookCanvas.width, notebookCanvas.height);
            notebookCtx.drawImage(notebookTempCanvas, 0, 0);
            
            notebookCtx.beginPath();
            
            if (notebookCurrentTool === 'line') {
                notebookCtx.moveTo(notebookStartX, notebookStartY);
                notebookCtx.lineTo(x, y);
            } else if (notebookCurrentTool === 'circle') {
                const radius = Math.sqrt(Math.pow(x - notebookStartX, 2) + Math.pow(y - notebookStartY, 2));
                notebookCtx.arc(notebookStartX, notebookStartY, radius, 0, 2 * Math.PI);
            } else if (notebookCurrentTool === 'rectangle') {
                notebookCtx.rect(notebookStartX, notebookStartY, x - notebookStartX, y - notebookStartY);
            } else if (notebookCurrentTool === 'triangle') {
                notebookCtx.moveTo(notebookStartX, notebookStartY);
                notebookCtx.lineTo(x, y);
                notebookCtx.lineTo(notebookStartX - (x - notebookStartX), y);
                notebookCtx.closePath();
            }
            
            notebookCtx.stroke();
        }
    }
}

// Notebook mouse events
notebookCanvas.addEventListener('mousedown', startNotebookDrawing);
notebookCanvas.addEventListener('mouseup', stopNotebookDrawing);
notebookCanvas.addEventListener('mousemove', drawOnNotebook);
notebookCanvas.addEventListener('mouseout', stopNotebookDrawing);

// Notebook touch events
notebookCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    notebookCanvas.dispatchEvent(mouseEvent);
});

notebookCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    notebookCanvas.dispatchEvent(mouseEvent);
});

notebookCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    notebookCanvas.dispatchEvent(mouseEvent);
});

// Clear notebook
document.getElementById('clearNotebook').addEventListener('click', () => {
    // Clear only the drawing canvas, not the grid
    notebookCtx.clearRect(0, 0, notebookCanvas.width, notebookCanvas.height);
    localStorage.removeItem('notebookDrawing');
});

// Notebook tool controls
document.getElementById('notebookPenColor').addEventListener('input', (e) => {
    notebookPenColor = e.target.value;
});

document.getElementById('notebookPenSize').addEventListener('input', (e) => {
    notebookPenSize = parseInt(e.target.value);
});

document.getElementById('notebookTool').addEventListener('change', (e) => {
    notebookCurrentTool = e.target.value;
});

// Toggle grid visibility
document.getElementById('toggleGrid').addEventListener('click', () => {
    gridVisible = !gridVisible;
    const btn = document.getElementById('toggleGrid');
    btn.textContent = gridVisible ? 'إخفاء' : 'إظهار';
    localStorage.setItem('notebookGridVisible', gridVisible);
    
    // Toggle grid canvas visibility
    if (gridVisible) {
        gridCanvas.style.display = 'block';
        drawGrid();
    } else {
        gridCanvas.style.display = 'none';
    }
});

// Pen toggle
document.getElementById('togglePen').addEventListener('click', () => {
    penEnabled = !penEnabled;
    document.getElementById('togglePen').classList.toggle('active');
    drawingCanvas.classList.toggle('active');
});

// Pen color change
document.getElementById('penColor').addEventListener('input', (e) => {
    penColor = e.target.value;
});

// Pen size change
document.getElementById('penSize').addEventListener('input', (e) => {
    penSize = parseInt(e.target.value);
});

// Clear drawing
document.getElementById('clearDrawing').addEventListener('click', () => {
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
});

// Drawing functions
function startDrawing(e) {
    if (!penEnabled) return;
    isDrawing = true;
    draw(e);
}

function stopDrawing() {
    isDrawing = false;
    drawingCtx.beginPath();
}

function draw(e) {
    if (!isDrawing || !penEnabled) return;
    
    const rect = drawingCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    drawingCtx.lineWidth = penSize;
    drawingCtx.lineCap = 'round';
    drawingCtx.strokeStyle = penColor;
    
    drawingCtx.lineTo(x, y);
    drawingCtx.stroke();
    drawingCtx.beginPath();
    drawingCtx.moveTo(x, y);
}

// Mouse events for drawing
drawingCanvas.addEventListener('mousedown', startDrawing);
drawingCanvas.addEventListener('mouseup', stopDrawing);
drawingCanvas.addEventListener('mousemove', draw);
drawingCanvas.addEventListener('mouseout', stopDrawing);

// Touch events for drawing
drawingCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    drawingCanvas.dispatchEvent(mouseEvent);
});

drawingCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    drawingCanvas.dispatchEvent(mouseEvent);
});

drawingCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    drawingCanvas.dispatchEvent(mouseEvent);
});

// Load PDF directly from URL (no base64 embedding)
async function loadPDF() {
    const loading = document.getElementById('loading');
    const statusText = document.getElementById('loadingStatusText');
    try {
        if (statusText) statusText.textContent = 'جاري تحميل كتاب الرياضيات...';
        
        pdfDoc = await pdfjsLib.getDocument(PDF_URL).promise;
        
        document.getElementById('pageInfo').textContent = `صفحة 1 من ${pdfDoc.numPages}`;
        loading.style.display = 'none';
        renderPage(pageNum);
    } catch (error) {
        console.error('Error loading PDF:', error);
        loading.innerHTML = `
            <div class="spinner"></div>
            <p style="color: red; margin-bottom: 1rem;">حدث خطأ في تحميل الكتاب</p>
            <p style="color: #888; font-size: 0.9rem;">الخطأ: ${error.message}</p>
            <div style="margin-top: 1rem;">
                <p style="color: #888; margin-bottom: 0.5rem;">يمكنك رفع الملف يدوياً:</p>
                <input type="file" id="pdfUpload" accept=".pdf" style="color: #fff; background: #333; padding: 0.5rem; border-radius: 5px;">
            </div>
        `;
        // Re-attach upload event
        const newUpload = document.getElementById('pdfUpload');
        if (newUpload) newUpload.addEventListener('change', handleFileUpload);
    }
}

// Render page
function renderPage(num) {
    pageRendering = true;
    pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({scale: scale});
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Sync drawing canvas size with PDF canvas
        drawingCanvas.height = viewport.height;
        drawingCanvas.width = viewport.width;
        drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        const renderTask = page.render(renderContext);

        renderTask.promise.then(function() {
            pageRendering = false;
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        });
    });

    document.getElementById('pageInfo').textContent = `صفحة ${num} من ${pdfDoc.numPages}`;
}

// Queue rendering
function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

// Previous page
document.getElementById('prevPage').addEventListener('click', () => {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
});

// Next page
document.getElementById('nextPage').addEventListener('click', () => {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
});

// Go to specific page
document.getElementById('gotoPageBtn').addEventListener('click', () => {
    const pageInput = document.getElementById('gotoPage');
    const targetPage = parseInt(pageInput.value);
    
    if (isNaN(targetPage) || targetPage < 1 || targetPage > pdfDoc.numPages) {
        alert('الرجاء إدخال رقم صفحة صحيح');
        return;
    }
    
    pageNum = targetPage;
    queueRenderPage(pageNum);
    pageInput.value = '';
});

// Mouse wheel scroll for page navigation (vertical scroll)
let isScrolling = false;
let scrollTimeout;

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    if (isScrolling) return;
    isScrolling = true;
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        isScrolling = false;
    }, 300);
    
    if (e.deltaY > 0) {
        // Scroll down - next page
        if (pageNum < pdfDoc.numPages) {
            pageNum++;
            queueRenderPage(pageNum);
        }
    } else {
        // Scroll up - previous page
        if (pageNum > 1) {
            pageNum--;
            queueRenderPage(pageNum);
        }
    }
}, { passive: false });

// Download button
document.getElementById('downloadBtn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = 'مقرر الرياضيات _كتاب الطالب الجزء الأول.pdf';
    link.download = 'كتاب_الرياضيات_الصف_الثاني_المتوسط.pdf';
    link.click();
});

// Fullscreen button
document.getElementById('fullscreenBtn').addEventListener('click', () => {
    const bookSection = document.querySelector('.book-section');
    
    if (!document.fullscreenElement) {
        bookSection.requestFullscreen().catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
            alert('حدث خطأ في تفعيل وضع ملء الشاشة');
        });
        document.getElementById('fullscreenBtn').textContent = '⛶ خروج';
    } else {
        document.exitFullscreen();
        document.getElementById('fullscreenBtn').textContent = '⛶ ملء الشاشة';
    }
});

// Update fullscreen button text when exiting fullscreen
document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('fullscreenBtn');
    if (document.fullscreenElement) {
        btn.textContent = '⛶ خروج';
    } else {
        btn.textContent = '⛶ ملء الشاشة';
    }
});

// Calculator functions
let calcExpression = '';

function appendCalc(value) {
    const display = document.getElementById('calcDisplay');
    if (calcExpression === '0' || calcExpression === 'Error') {
        calcExpression = value;
    } else {
        calcExpression += value;
    }
    display.value = calcExpression;
}

function clearCalc() {
    calcExpression = '';
    document.getElementById('calcDisplay').value = '0';
}

function calculate() {
    const display = document.getElementById('calcDisplay');
    try {
        // Replace √ with Math.sqrt
        let expression = calcExpression.replace(/√/g, 'Math.sqrt');
        let result = eval(expression);
        
        if (result === Infinity || result === -Infinity) {
            display.value = 'Error';
            calcExpression = '';
        } else {
            display.value = result.toFixed(8).replace(/\.?0+$/, '');
            calcExpression = display.value;
        }
    } catch (error) {
        display.value = 'Error';
        calcExpression = '';
    }
}

// Unit Converter
const conversionUnits = {
    length: {
        'مليمتر': 0.001,
        'سنتيمتر': 0.01,
        'ديسيمتر': 0.1,
        'متر': 1,
        'ديكامتر': 10,
        'هكتومتر': 100,
        'كيلومتر': 1000
    },
    weight: {
        'ملigram': 0.001,
        'غرام': 1,
        'كيلوغرام': 1000,
        'طن': 1000000
    },
    area: {
        'مليمتر مربع': 0.000001,
        'سنتيمتر مربع': 0.0001,
        'ديسيمتر مربع': 0.01,
        'متر مربع': 1,
        'آر': 100,
        'هكتار': 10000,
        'كيلومتر مربع': 1000000
    }
};

function updateConversionUnits() {
    const type = document.getElementById('conversionType').value;
    const fromUnit = document.getElementById('fromUnit');
    const toUnit = document.getElementById('toUnit');
    const units = conversionUnits[type];
    
    fromUnit.innerHTML = '';
    toUnit.innerHTML = '';
    
    for (const unit in units) {
        fromUnit.innerHTML += `<option value="${unit}">${unit}</option>`;
        toUnit.innerHTML += `<option value="${unit}">${unit}</option>`;
    }
    
    // Set different default values
    if (toUnit.options.length > 1) {
        toUnit.selectedIndex = 1;
    }
}

function convert() {
    const type = document.getElementById('conversionType').value;
    const fromValue = parseFloat(document.getElementById('fromValue').value);
    const fromUnit = document.getElementById('fromUnit').value;
    const toUnit = document.getElementById('toUnit').value;
    const units = conversionUnits[type];
    
    if (isNaN(fromValue)) {
        alert('الرجاء إدخال قيمة صحيحة');
        return;
    }
    
    // Convert to base unit, then to target unit
    const baseValue = fromValue * units[fromUnit];
    const result = baseValue / units[toUnit];
    
    document.getElementById('toValue').value = result.toFixed(6).replace(/\.?0+$/, '');
}

// Multiplication Table
function showMultiplicationTable() {
    const number = parseInt(document.getElementById('multiplyNumber').value);
    const table = document.getElementById('multiplicationTable');
    table.innerHTML = '';
    
    for (let i = 1; i <= 10; i++) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `
            <span>${number} × ${i}</span>
            <span>= ${number * i}</span>
        `;
        table.appendChild(row);
    }
}

// Division Table
function showDivisionTable() {
    const number = parseInt(document.getElementById('divideNumber').value);
    const table = document.getElementById('divisionTable');
    table.innerHTML = '';
    
    for (let i = 1; i <= 10; i++) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `
            <span>${number * i} ÷ ${number}</span>
            <span>= ${i}</span>
        `;
        table.appendChild(row);
    }
}

// Addition Machine
function addNumbers() {
    const num1 = parseFloat(document.getElementById('addNum1').value);
    const num2 = parseFloat(document.getElementById('addNum2').value);
    
    if (isNaN(num1) || isNaN(num2)) {
        document.getElementById('addResult').textContent = 'الرجاء إدخال أرقام صحيحة';
        return;
    }
    
    document.getElementById('addResult').textContent = `النتيجة: ${num1 + num2}`;
}

// Subtraction Machine
function subtractNumbers() {
    const num1 = parseFloat(document.getElementById('subNum1').value);
    const num2 = parseFloat(document.getElementById('subNum2').value);
    
    if (isNaN(num1) || isNaN(num2)) {
        document.getElementById('subResult').textContent = 'الرجاء إدخال أرقام صحيحة';
        return;
    }
    
    document.getElementById('subResult').textContent = `النتيجة: ${num1 - num2}`;
}

// Multiplication Machine
function multiplyNumbers() {
    const num1 = parseFloat(document.getElementById('mulNum1').value);
    const num2 = parseFloat(document.getElementById('mulNum2').value);
    
    if (isNaN(num1) || isNaN(num2)) {
        document.getElementById('mulResult').textContent = 'الرجاء إدخال أرقام صحيحة';
        return;
    }
    
    document.getElementById('mulResult').textContent = `النتيجة: ${num1 * num2}`;
}

// Division Machine
function divideNumbers() {
    const num1 = parseFloat(document.getElementById('divNum1').value);
    const num2 = parseFloat(document.getElementById('divNum2').value);
    
    if (isNaN(num1) || isNaN(num2)) {
        document.getElementById('divResult').textContent = 'الرجاء إدخال أرقام صحيحة';
        return;
    }
    
    if (num2 === 0) {
        document.getElementById('divResult').textContent = 'لا يمكن القسمة على صفر';
        return;
    }
    
    document.getElementById('divResult').textContent = `النتيجة: ${(num1 / num2).toFixed(4).replace(/\.?0+$/, '')}`;
}

// Manual PDF upload handler
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const loading = document.getElementById('loading');
    loading.style.display = 'flex';
    loading.innerHTML = `
        <div class="spinner"></div>
        <p>جاري تحميل الملف المرفوع...</p>
    `;
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
        document.getElementById('pageInfo').textContent = `صفحة 1 من ${pdfDoc.numPages}`;
        loading.style.display = 'none';
        pageNum = 1;
        renderPage(pageNum);
    } catch (error) {
        console.error('Error loading uploaded PDF:', error);
        loading.innerHTML = `
            <p style="color: red; margin-bottom: 1rem;">حدث خطأ في تحميل الملف</p>
            <p style="color: #888; font-size: 0.9rem;">الخطأ: ${error.message}</p>
        `;
    }
}

// Attach upload event
document.getElementById('pdfUpload').addEventListener('change', handleFileUpload);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadPDF();
    updateConversionUnits();
    showMultiplicationTable();
    showDivisionTable();
    
    // Auto-enter fullscreen after PDF loads
    setTimeout(() => {
        const bookSection = document.querySelector('.book-section');
        if (bookSection && !document.fullscreenElement) {
            bookSection.requestFullscreen().catch(err => {
                console.log('Auto-fullscreen failed:', err);
            });
        }
    }, 1000);
});
