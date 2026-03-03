/**
 * HangmanCanvas - Draws the hangman figure on a canvas element.
 * Responsive: auto-sizes to container, redraws on resize.
 */
class HangmanCanvas {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.stage = 0; // 0 = nothing drawn, max = full hangman
    this.maxStages = 6;
    this._resizeObserver = null;
    this._init();
  }

  _init() {
    this._setupResize();
    this._resize();
  }

  _setupResize() {
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.canvas.parentElement);
  }

  _resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const size = Math.min(w, h, 300);
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.w = size;
    this.h = size;
    this.draw();
  }

  setMaxStages(max) {
    this.maxStages = max;
  }

  reset() {
    this.stage = 0;
    this.draw();
  }

  addStage() {
    if (this.stage < this.maxStages) {
      this.stage++;
      this.draw();
    }
  }

  setStage(n) {
    this.stage = Math.max(0, Math.min(n, this.maxStages));
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;

    ctx.clearRect(0, 0, w, h);

    // scaling factors
    const s = w / 200; // design at 200x200

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw gallows (always visible)
    this._drawGallows(ctx, s);

    // Map stages to body parts based on maxStages
    const parts = this._getPartsForStage();

    for (let i = 0; i < parts.length; i++) {
      this._drawPart(ctx, s, parts[i]);
    }
  }

  _drawGallows(ctx, s) {
    ctx.strokeStyle = '#4a4a6a';
    ctx.lineWidth = 3 * s;

    // Base
    ctx.beginPath();
    ctx.moveTo(20 * s, 180 * s);
    ctx.lineTo(80 * s, 180 * s);
    ctx.stroke();

    // Vertical pole
    ctx.beginPath();
    ctx.moveTo(50 * s, 180 * s);
    ctx.lineTo(50 * s, 20 * s);
    ctx.stroke();

    // Horizontal beam
    ctx.beginPath();
    ctx.moveTo(50 * s, 20 * s);
    ctx.lineTo(130 * s, 20 * s);
    ctx.stroke();

    // Support brace
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(70 * s, 20 * s);
    ctx.lineTo(50 * s, 45 * s);
    ctx.stroke();

    // Rope
    ctx.strokeStyle = '#8a7050';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(130 * s, 20 * s);
    ctx.lineTo(130 * s, 40 * s);
    ctx.stroke();
  }

  _getPartsForStage() {
    // All possible body parts in order
    const allParts = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'leftFoot', 'rightFoot', 'leftHand', 'rightHand'];

    // Select which parts to use based on maxStages
    let usedParts;
    switch (this.maxStages) {
      case 4:
        usedParts = ['head', 'body', 'arms', 'legs']; // combined
        break;
      case 5:
        usedParts = ['head', 'body', 'leftArm', 'rightArm', 'legs'];
        break;
      case 6:
        usedParts = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        break;
      case 8:
        usedParts = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'leftFoot', 'rightFoot'];
        break;
      case 10:
        usedParts = allParts;
        break;
      default:
        usedParts = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
    }

    return usedParts.slice(0, this.stage);
  }

  _drawPart(ctx, s, part) {
    ctx.strokeStyle = '#eaeaea';
    ctx.fillStyle = '#eaeaea';
    ctx.lineWidth = 2.5 * s;

    const cx = 130 * s; // center x (where rope ends)

    switch (part) {
      case 'head':
        ctx.beginPath();
        ctx.arc(cx, 55 * s, 15 * s, 0, Math.PI * 2);
        ctx.stroke();
        // Eyes (X's for dead when max stage reached)
        if (this.stage >= this.maxStages) {
          this._drawDeadFace(ctx, s, cx);
        } else {
          this._drawAliveFace(ctx, s, cx);
        }
        break;

      case 'body':
        ctx.beginPath();
        ctx.moveTo(cx, 70 * s);
        ctx.lineTo(cx, 120 * s);
        ctx.stroke();
        break;

      case 'leftArm':
        ctx.beginPath();
        ctx.moveTo(cx, 80 * s);
        ctx.lineTo(cx - 25 * s, 105 * s);
        ctx.stroke();
        break;

      case 'rightArm':
        ctx.beginPath();
        ctx.moveTo(cx, 80 * s);
        ctx.lineTo(cx + 25 * s, 105 * s);
        ctx.stroke();
        break;

      case 'arms': // combined for 4-stage
        ctx.beginPath();
        ctx.moveTo(cx - 25 * s, 105 * s);
        ctx.lineTo(cx, 80 * s);
        ctx.lineTo(cx + 25 * s, 105 * s);
        ctx.stroke();
        break;

      case 'leftLeg':
        ctx.beginPath();
        ctx.moveTo(cx, 120 * s);
        ctx.lineTo(cx - 22 * s, 155 * s);
        ctx.stroke();
        break;

      case 'rightLeg':
        ctx.beginPath();
        ctx.moveTo(cx, 120 * s);
        ctx.lineTo(cx + 22 * s, 155 * s);
        ctx.stroke();
        break;

      case 'legs': // combined for 4/5-stage
        ctx.beginPath();
        ctx.moveTo(cx - 22 * s, 155 * s);
        ctx.lineTo(cx, 120 * s);
        ctx.lineTo(cx + 22 * s, 155 * s);
        ctx.stroke();
        break;

      case 'leftFoot':
        ctx.beginPath();
        ctx.moveTo(cx - 22 * s, 155 * s);
        ctx.lineTo(cx - 32 * s, 155 * s);
        ctx.stroke();
        break;

      case 'rightFoot':
        ctx.beginPath();
        ctx.moveTo(cx + 22 * s, 155 * s);
        ctx.lineTo(cx + 32 * s, 155 * s);
        ctx.stroke();
        break;

      case 'leftHand':
        ctx.beginPath();
        ctx.moveTo(cx - 25 * s, 105 * s);
        ctx.lineTo(cx - 30 * s, 112 * s);
        ctx.stroke();
        break;

      case 'rightHand':
        ctx.beginPath();
        ctx.moveTo(cx + 25 * s, 105 * s);
        ctx.lineTo(cx + 30 * s, 112 * s);
        ctx.stroke();
        break;
    }
  }

  _drawAliveFace(ctx, s, cx) {
    ctx.fillStyle = '#eaeaea';
    // Left eye
    ctx.beginPath();
    ctx.arc(cx - 5 * s, 52 * s, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
    // Right eye
    ctx.beginPath();
    ctx.arc(cx + 5 * s, 52 * s, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawDeadFace(ctx, s, cx) {
    ctx.strokeStyle = '#ff4757';
    ctx.lineWidth = 1.5 * s;

    // Left X eye
    const ex = cx - 5 * s;
    const ey = 52 * s;
    const ed = 3 * s;
    ctx.beginPath();
    ctx.moveTo(ex - ed, ey - ed);
    ctx.lineTo(ex + ed, ey + ed);
    ctx.moveTo(ex + ed, ey - ed);
    ctx.lineTo(ex - ed, ey + ed);
    ctx.stroke();

    // Right X eye
    const rex = cx + 5 * s;
    ctx.beginPath();
    ctx.moveTo(rex - ed, ey - ed);
    ctx.lineTo(rex + ed, ey + ed);
    ctx.moveTo(rex + ed, ey - ed);
    ctx.lineTo(rex - ed, ey + ed);
    ctx.stroke();

    // Tongue / sad mouth
    ctx.strokeStyle = '#ff4757';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.arc(cx, 60 * s, 4 * s, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }

  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
  }
}

// Export for use
window.HangmanCanvas = HangmanCanvas;
