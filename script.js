class Tetris {
  constructor() {
    console.log('🟢 Tetris Pro - EXPLOSION + SOUND!');
    
    this.canvas = document.getElementById('tetris');
    this.nextCanvas = document.getElementById('nextCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.nextCtx = this.nextCanvas.getContext('2d');
    
    this.scoreEl = document.getElementById('score');
    this.levelEl = document.getElementById('level');
    this.linesEl = document.getElementById('lines');
    this.gameOverEl = document.getElementById('gameOver');
    this.finalScoreEl = document.getElementById('finalScore');
    
    this.startBtn = document.getElementById('startBtn');
    this.pauseBtn = document.getElementById('pauseBtn');
    this.restartBtn = document.getElementById('restartBtn');
    
    // 🎵 AUDIO CONTEXT
    this.audioCtx = null;
    this.initAudio();
    
    // 💥 PARTICLES
    this.particles = [];
    
    this.ROWS = 20;
    this.COLS = 10;
    this.BLOCK_SIZE = 16;
    this.canvas.width = this.COLS * this.BLOCK_SIZE;
    this.canvas.height = this.ROWS * this.BLOCK_SIZE;
    this.ctx.scale(this.BLOCK_SIZE, this.BLOCK_SIZE);
    this.nextCtx.scale(4, 4);
    
    this.initGame();
    this.bindEvents();
    this.draw();
  }

  initAudio() {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {
      console.log('Audio tidak support');
    }
  }

  playSound(frequency, duration, type = 'sine', volume = 0.3) {
    if (!this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      
      osc.frequency.value = frequency;
      osc.type = type;
      
      gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
      
      osc.start(this.audioCtx.currentTime);
      osc.stop(this.audioCtx.currentTime + duration);
    } catch(e) {}
  }

  playExplosionSound() {
    // 💥 EXPLOSION MULTI-TONE
    const notes = [800, 600, 1000, 400];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playSound(freq, 0.1, 'sawtooth', 0.3), i * 30);
    });
  }

  playRotateSound() {
    this.playSound(660, 0.08, 'square', 0.2);
  }

  playDropSound() {
    this.playSound(220, 0.06, 'sine', 0.15);
  }

  createExplosion(x, y) {
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        x: x + Math.random() * 0.8,
        y: y + Math.random() * 0.2,
        vx: (Math.random() - 0.5) * 0.4,
        vy: Math.random() * -0.3,
        life: 1.0,
        maxLife: 1.0,
        color: `hsl(${Math.random()*60 + 10}, 100%, 60%)`
      });
    }
  }

  updateParticles() {
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.015;
      p.life -= 0.04;
      p.maxLife -= 0.04;
      return p.life > 0;
    });
  }

  drawParticles() {
    this.particles.forEach(p => {
      this.ctx.save();
      this.ctx.globalAlpha = p.life / p.maxLife;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 12;
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.x, p.y, 0.15, 0.15);
      this.ctx.restore();
    });
  }

  initGame() {
    this.arena = this.createMatrix(this.COLS, this.ROWS);
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropInterval = 800;
    this.dropCounter = 0;
    this.lastTime = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.current = null;
    this.nextPiece = null;
    this.updateDisplay();
  }

  createMatrix(w, h) {
    const matrix = [];
    while (h--) matrix.push(new Array(w).fill(0));
    return matrix;
  }

  createPiece(type) {
    if (!type) type = Math.floor(Math.random() * 7) + 1;
    
    const shapes = [
      null,
      [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
      [[1,0,0],[1,1,1],[0,0,0]],                   // J
      [[1,1],[1,1]],                                // O
      [[0,0,1],[1,1,1],[0,0,0]],                   // L
      [[0,1,0],[1,1,1],[0,0,0]],                   // T
      [[1,1,0],[0,1,1],[0,0,0]],                   // Z
      [[0,1,1],[1,1,0],[0,0,0]]                    // S
    ];
    
    return {
      matrix: shapes[type],
      pos: {x: Math.floor(this.COLS/2) - 2, y: 0}
    };
  }

  rotate(matrix) {
    const N = matrix.length - 1;
    const result = matrix[0].map((_, index) =>
      matrix.map(row => row[N - index])
    );
    return result;
  }

  collide(arena, piece) {
    const m = piece.matrix;
    const o = piece.pos;
    for (let y = 0; y < m.length; ++y) {
      for (let x = 0; x < m[y].length; ++x) {
        if (m[y][x] !== 0) {
          const newY = y + o.y;
          const newX = x + o.x;
          if (newY >= this.ROWS || newX < 0 || newX >= this.COLS || 
              (newY < 0 ? false : arena[newY][newX])) {
            return true;
          }
        }
      }
    }
    return false;
  }

  merge(arena, piece) {
    piece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          arena[y + piece.pos.y][x + piece.pos.x] = value;
        }
      });
    });
  }

  arenaSweep() {
    let rowCount = 0;
    outer: for (let y = this.arena.length - 1; y > 0; --y) {
      for (let x = 0; x < this.arena[y].length; ++x) {
        if (this.arena[y][x] === 0) {
          continue outer;
        }
      }
      // 💥 EXPLOSION EFFECT + SOUND
      for (let x = 0; x < this.COLS; x++) {
        this.createExplosion(x, y);
      }
      this.playExplosionSound();
      
      const row = this.arena.splice(y, 1)[0].fill(0);
      this.arena.unshift(row);
      y++;
      rowCount++;
    }
    
    if (rowCount > 0) {
      this.score += rowCount * 100 * this.level;
      this.lines += rowCount;
      this.updateDisplay();
      this.checkLevelUp();
      console.log(`🎉💥 ${rowCount} BARIS MELEDAK!`);
    }
  }

  checkLevelUp() {
    const newLevel = Math.floor(this.lines / 10) + 1;
    if (newLevel > this.level) {
      this.level = newLevel;
      this.dropInterval = Math.max(50, 800 - (this.level - 1) * 60);
    }
  }

  playerDrop() {
    this.current.pos.y++;
    if (this.collide(this.arena, this.current)) {
      this.current.pos.y--;
      this.merge(this.arena, this.current);
      this.playDropSound();
      this.arenaSweep();
      this.playerReset();
      return;
    }
    this.dropCounter = 0;
  }

  playerReset() {
    this.current = this.nextPiece;
    this.nextPiece = this.createPiece();
    if (this.collide(this.arena, this.current)) {
      this.gameOver();
    }
  }

  playerMove(dir) {
    this.current.pos.x += dir;
    if (this.collide(this.arena, this.current)) {
      this.current.pos.x -= dir;
    }
  }

  playerRotate() {
    const rotated = this.rotate(this.current.matrix);
    this.current.matrix = rotated;
    
    const kicks = [0, -1, 1, -2, 2];
    for (let kick of kicks) {
      this.current.pos.x += kick;
      if (!this.collide(this.arena, this.current)) {
        this.playRotateSound();
        return;
      }
      this.current.pos.x -= kick;
    }
    this.current.matrix = this.rotate(this.rotate(this.rotate(rotated)));
  }

  hardDrop() {
    while(!this.collide(this.arena, this.current)) {
      this.playerDrop();
    }
    this.playDropSound();
    this.arenaSweep();
    this.playerReset();
  }

  drawBlock(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillRect(x, y, 1, 1);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.05;
    ctx.strokeRect(x, y, 1, 1);
  }

  drawMatrix(matrix, offset, ctx) {
    const colors = [null, '#0ff','#007bff','#ffc107','#fd7e14','#6f42c1','#dc3545','#28a745'];
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          this.drawBlock(ctx, x + offset.x, y + offset.y, colors[value]);
        }
      });
    });
  }

  draw() {
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, 0, this.COLS, this.ROWS);
    
    this.drawMatrix(this.arena, {x: 0, y: 0}, this.ctx);
    
    if (this.current && this.current.matrix) {
      this.drawMatrix(this.current.matrix, this.current.pos, this.ctx);
    }
    
    // 💥 DRAW EXPLOSION PARTICLES
    this.updateParticles();
    this.drawParticles();
    
    // Next piece
    this.nextCtx.fillStyle = '#111';
    this.nextCtx.fillRect(0, 0, 8, 8);
    if (this.nextPiece && this.nextPiece.matrix) {
      this.drawMatrix(this.nextPiece.matrix, {x: 1, y: 1}, this.nextCtx);
    }
  }

  update(time = 0) {
    if (!this.isRunning || this.isPaused) {
      requestAnimationFrame(time => this.update(time));
      return;
    }
    
    const deltaTime = time - this.lastTime;
    this.lastTime = time;
    this.dropCounter += deltaTime;
    
    if (this.dropCounter > this.dropInterval) {
      this.playerDrop();
    }
    
    this.draw();
    requestAnimationFrame(time => this.update(time));
  }

  updateDisplay() {
    this.scoreEl.textContent = this.score;
    this.levelEl.textContent = this.level;
    this.linesEl.textContent = this.lines;
  }

  gameOver() {
    this.isRunning = false;
    this.finalScoreEl.textContent = this.score;
    this.gameOverEl.classList.add('active');
  }

  bindEvents() {
    document.addEventListener('keydown', e => {
      if (!this.isRunning || this.isPaused) return;
      switch(e.key) {
        case 'ArrowLeft':  this.playerMove(-1); break;
        case 'ArrowRight': this.playerMove(1); break;
        case 'ArrowDown':  this.playerDrop(); break;
        case 'ArrowUp':    this.playerRotate(); break;
        case ' ': e.preventDefault(), this.hardDrop(); break;
      }
      this.draw();
    });

    this.startBtn.onclick = () => this.start();
    this.pauseBtn.onclick = () => this.pause();
    this.restartBtn.onclick = () => this.restart();

    let touchStartX = 0;
    this.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      touchStartX = e.touches[0].clientX;
    });
    this.canvas.addEventListener('touchend', e => {
      e.preventDefault();
      if (!this.isRunning || this.isPaused) return;
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchEndX - touchStartX;
      if (Math.abs(diff) > 30) {
        this.playerMove(diff > 0 ? 1 : -1);
      } else {
        this.playerRotate();
      }
      this.draw();
    });
  }

  start() {
    // Resume audio context untuk mobile
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    
    this.initGame();
    this.nextPiece = this.createPiece();
    this.playerReset();
    this.isRunning = true;
    this.isPaused = false;
    this.startBtn.disabled = true;
    this.pauseBtn.disabled = false;
    this.pauseBtn.textContent = '⏸️ Pause';
    this.gameOverEl.classList.remove('active');
    this.update();
  }

  pause() {
    this.isPaused = !this.isPaused;
    this.pauseBtn.textContent = this.isPaused ? '▶️ Resume' : '⏸️ Pause';
  }

  restart() {
    this.initGame();
    this.gameOverEl.classList.remove('active');
    this.startBtn.disabled = false;
    this.pauseBtn.disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Tetris EXPLOSION Loaded!');
  new Tetris();
});
