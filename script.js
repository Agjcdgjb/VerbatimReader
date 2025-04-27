class TextReader {
    constructor() {
        this.text = '';
        this.currentIndex = 0;
        this.timer = null;
        this.isPlaying = false;
        this.speed = 300; // 預設速度：每分鐘300字
        this.maxFileSize = 10 * 1024 * 1024; // 10MB

        // DOM 元素
        this.textDisplay = document.getElementById('textDisplay');
        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.speedInput = document.getElementById('speed');
        this.speedValue = document.getElementById('speedValue');
        this.bookFile = document.getElementById('bookFile');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        
        // 進度條元素
        this.progressPercentage = document.getElementById('progressPercentage');
        this.progressFill = document.getElementById('progressFill');
        this.progressBar = document.getElementById('progressBar');
        this.progressHandle = document.getElementById('progressHandle');

        // 綁定事件
        this.startBtn.addEventListener('click', () => this.start());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.speedInput.addEventListener('input', () => this.updateSpeed());
        this.bookFile.addEventListener('change', (e) => this.loadBook(e));

        // 進度條拖曳相關
        this.isDragging = false;
        this.progressBar.addEventListener('mousedown', (e) => this.startDragging(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.stopDragging());
        this.progressBar.addEventListener('click', (e) => this.jumpToPosition(e));

        // 初始化按鈕狀態
        this.updateButtonStates();
        this.updateSpeedValue();

        // 初始化 PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    showLoading() {
        this.loadingIndicator.style.display = 'block';
        this.textDisplay.style.display = 'none';
    }

    hideLoading() {
        this.loadingIndicator.style.display = 'none';
        this.textDisplay.style.display = 'block';
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        this.textDisplay.parentNode.insertBefore(errorDiv, this.textDisplay);
        setTimeout(() => errorDiv.remove(), 5000);
    }

    async loadBook(event) {
        const file = event.target.files[0];
        if (!file) return;

        // 檢查檔案大小
        if (file.size > this.maxFileSize) {
            this.showError(`檔案太大，請選擇小於 ${this.maxFileSize / (1024 * 1024)}MB 的檔案`);
            return;
        }

        const fileType = file.name.split('.').pop().toLowerCase();
        console.log('正在載入檔案:', file.name, '類型:', fileType, '大小:', (file.size / 1024 / 1024).toFixed(2), 'MB');
        
        this.showLoading();
        
        try {
            switch (fileType) {
                case 'txt':
                    await this.loadTxtFile(file);
                    break;
                case 'pdf':
                    await this.loadPdfFile(file);
                    break;
                case 'epub':
                    await this.loadEpubFile(file);
                    break;
                case 'docx':
                    await this.loadDocxFile(file);
                    break;
                case 'html':
                    await this.loadHtmlFile(file);
                    break;
                default:
                    throw new Error('不支援的檔案格式');
            }
            
            console.log('檔案載入成功，文字長度:', this.text.length);
            this.currentIndex = 0;
            this.stop();
            this.textDisplay.textContent = '';
            this.updateProgress();
        } catch (error) {
            console.error('載入檔案時發生錯誤:', error);
            console.error('錯誤堆疊:', error.stack);
            this.showError(`載入檔案時發生錯誤: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    async loadTxtFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.text = e.target.result;
                resolve();
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    async loadPdfFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        
        this.text = fullText;
    }

    async loadEpubFile(file) {
        console.log('開始載入 EPUB 檔案');
        
        try {
            // 使用 JSZip 直接解壓縮 EPUB 檔案
            const arrayBuffer = await file.arrayBuffer();
            console.log('檔案已轉換為 ArrayBuffer');
            
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(arrayBuffer);
            console.log('EPUB 檔案已解壓縮');
            
            // 尋找並讀取內容檔案
            let fullText = '';
            const contentPromises = [];
            
            // 遍歷所有檔案
            zipContent.forEach((relativePath, zipEntry) => {
                if (relativePath.endsWith('.xhtml') || 
                    relativePath.endsWith('.html') || 
                    relativePath.endsWith('.xml') || 
                    relativePath.endsWith('.ncx')) {
                    contentPromises.push(
                        zipEntry.async('text').then(content => {
                            // 使用 DOMParser 解析 HTML 內容
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(content, 'text/html');
                            const text = doc.body.textContent;
                            fullText += text + '\n';
                            console.log(`已處理檔案: ${relativePath}`);
                        }).catch(error => {
                            console.warn(`處理檔案 ${relativePath} 時發生錯誤:`, error);
                        })
                    );
                }
            });
            
            // 等待所有內容處理完成
            await Promise.all(contentPromises);
            
            if (fullText.length === 0) {
                throw new Error('無法從 EPUB 檔案中提取文字內容');
            }
            
            // 清理文字內容
            fullText = fullText.replace(/\s+/g, ' ').trim();
            
            console.log('EPUB 處理完成，總文字長度:', fullText.length);
            this.text = fullText;
            
        } catch (error) {
            console.error('載入 EPUB 檔案時發生錯誤:', error);
            throw error;
        }
    }

    async loadDocxFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({arrayBuffer: arrayBuffer});
        this.text = result.value;
    }

    async loadHtmlFile(file) {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        this.text = doc.body.textContent;
    }

    start() {
        if (this.isPlaying || !this.text) return;
        
        this.isPlaying = true;
        this.updateButtonStates();
        
        const interval = (60 * 1000) / this.speed; // 計算每個字的顯示間隔（毫秒）
        
        this.timer = setInterval(() => {
            if (this.currentIndex < this.text.length) {
                this.textDisplay.textContent = this.text[this.currentIndex];
                this.currentIndex++;
                this.updateProgress();
            } else {
                this.stop();
            }
        }, interval);
    }

    pause() {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        clearInterval(this.timer);
        this.updateButtonStates();
    }

    stop() {
        this.isPlaying = false;
        clearInterval(this.timer);
        this.currentIndex = 0;
        this.textDisplay.textContent = '';
        this.updateButtonStates();
        this.updateProgress();
    }

    updateSpeed() {
        const newSpeed = parseInt(this.speedInput.value);
        if (newSpeed >= 100 && newSpeed <= 1000) {
            this.speed = newSpeed;
            this.updateSpeedValue();
            if (this.isPlaying) {
                this.pause();
                this.start();
            }
        }
    }

    updateSpeedValue() {
        this.speedValue.textContent = this.speedInput.value;
    }

    updateProgress() {
        if (this.text) {
            const percentage = Math.round((this.currentIndex / this.text.length) * 100);
            this.progressPercentage.textContent = `${percentage}%`;
            this.progressFill.style.width = `${percentage}%`;
            this.progressHandle.style.left = `${percentage}%`;
        } else {
            this.progressPercentage.textContent = '0%';
            this.progressFill.style.width = '0%';
            this.progressHandle.style.left = '0%';
        }
    }

    startDragging(e) {
        if (!this.text) return;
        this.isDragging = true;
        this.pause();
        this.updatePosition(e);
    }

    drag(e) {
        if (!this.isDragging || !this.text) return;
        this.updatePosition(e);
    }

    stopDragging() {
        if (!this.isDragging || !this.text) return;
        this.isDragging = false;
        this.start();
    }

    jumpToPosition(e) {
        if (!this.text) return;
        this.pause();
        this.updatePosition(e);
        this.start();
    }

    updatePosition(e) {
        const rect = this.progressBar.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        this.currentIndex = Math.floor((percentage / 100) * this.text.length);
        this.textDisplay.textContent = this.text[this.currentIndex];
        this.updateProgress();
    }

    updateButtonStates() {
        this.startBtn.disabled = this.isPlaying || !this.text;
        this.pauseBtn.disabled = !this.isPlaying;
        this.stopBtn.disabled = !this.text;
    }
}

// 初始化閱讀器
const reader = new TextReader(); 