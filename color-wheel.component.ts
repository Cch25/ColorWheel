/*
<form [formGroup]="form">
  <app-color-picker formControlName="color"></app-color-picker>
</form>

form = new FormGroup({
  color: new FormControl('#ff0000')
});
*/

import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  forwardRef
} from '@angular/core';

import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR
} from '@angular/forms';

@Component({
  selector: 'app-color-picker',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ColorPickerComponent),
      multi: true
    }
  ],
  template: `
    <div class="wrapper">
      <canvas
        #canvas
        (pointerdown)="startDrag($event)"
        (pointermove)="onDrag($event)"
        (pointerup)="stopDrag()"
        (pointerleave)="stopDrag()"
      ></canvas>

      <div class="preview" [style.background]="hexColor"></div>

      <input
        #shadeSlider
        type="range"
        class="slider"
        min="-50"
        max="50"
        [value]="shade"
        (input)="onShadeChange($event)"
      />

      <div class="value">{{ hexColor }}</div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      justify-content: center;
    }

    .wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 320px;
      gap: 12px;
    }

    canvas {
      border-radius: 50%;
      cursor: crosshair;
      touch-action: none;
    }

    .preview {
      width: 80px;
      height: 80px;
      border-radius: 16px;
      border: 2px solid #fff;
    }

    .slider {
      width: 100%;
      appearance: none;
      height: 12px;
      border-radius: 10px;
      outline: none;
      cursor: pointer;
    }

    .slider::-webkit-slider-thumb {
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: white;
      border: 2px solid black;
      cursor: pointer;
    }

    .value {
      font-size: 14px;
      font-weight: bold;
    }
  `]
})
export class ColorPickerComponent
  implements AfterViewInit, ControlValueAccessor {

  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  @ViewChild('shadeSlider', { static: true })
  shadeSliderRef!: ElementRef<HTMLInputElement>;

  ctx!: CanvasRenderingContext2D;
  offscreen!: HTMLCanvasElement;
  offCtx!: CanvasRenderingContext2D;

  size = 300;
  radius = 150;
  center = 150;

  selector = { x: 150, y: 150 };
  dragging = false;

  baseColor = { r: 255, g: 0, b: 0 };
  shade = 0;
  disabled = false;

  private onChange: any = () => {};
  private onTouched: any = () => {};

  // ---------------- INIT ----------------

  ngAfterViewInit() {
    this.setupCanvas();
    this.generateWheel();
    this.render();
    this.updateSliderBackground();
  }

  setupCanvas() {
    const canvas = this.canvasRef.nativeElement;

    this.size = 300;
    this.radius = this.size / 2;
    this.center = this.radius;

    canvas.width = this.size;
    canvas.height = this.size;

    this.ctx = canvas.getContext('2d')!;

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = this.size;
    this.offscreen.height = this.size;
    this.offCtx = this.offscreen.getContext('2d')!;
  }

  // ---------------- WHEEL (DRAW ONCE) ----------------

  generateWheel() {
    const image = this.offCtx.createImageData(this.size, this.size);
    const data = image.data;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {

        const dx = x - this.center;
        const dy = y - this.center;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= this.radius) {
          const angle = Math.atan2(dy, dx);
          const hue = (angle * 180 / Math.PI + 360) % 360;
          const saturation = (distance / this.radius) * 100;

          const [r, g, b] = this.hslToRgb(hue, saturation, 50);

          const i = (y * this.size + x) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
    }

    this.offCtx.putImageData(image, 0, 0);
  }

  render() {
    this.ctx.clearRect(0, 0, this.size, this.size);
    this.ctx.drawImage(this.offscreen, 0, 0);
    this.drawSelector();
  }

  drawSelector() {
    this.ctx.beginPath();
    this.ctx.arc(this.selector.x, this.selector.y, 10, 0, Math.PI * 2);
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = 'white';
    this.ctx.stroke();
  }

  // ---------------- POINTER ----------------

  startDrag(event: PointerEvent) {
    if (this.disabled) return;
    this.dragging = true;
    this.handlePointer(event);
  }

  onDrag(event: PointerEvent) {
    if (!this.dragging) return;
    this.handlePointer(event);
  }

  stopDrag() {
    this.dragging = false;
  }

  handlePointer(event: PointerEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();

    let x = event.clientX - rect.left;
    let y = event.clientY - rect.top;

    const dx = x - this.center;
    const dy = y - this.center;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > this.radius) {
      const angle = Math.atan2(dy, dx);
      x = this.center + this.radius * Math.cos(angle);
      y = this.center + this.radius * Math.sin(angle);
    }

    this.selector = { x, y };
    this.updateBaseColorFromSelector();
    this.render();
    this.emitValue();
  }

  updateBaseColorFromSelector() {
    const dx = this.selector.x - this.center;
    const dy = this.selector.y - this.center;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    const hue = (angle * 180 / Math.PI + 360) % 360;
    const saturation = Math.min((distance / this.radius) * 100, 100);

    const [r, g, b] = this.hslToRgb(hue, saturation, 50);

    this.baseColor = { r, g, b };
    this.shade = 0;

    this.updateSliderBackground();
  }

  // ---------------- SHADE ----------------

  onShadeChange(event: any) {
    this.shade = parseInt(event.target.value, 10);
    this.emitValue();
  }

  adjustShade(amount: number) {
    let { r, g, b } = this.baseColor;

    if (amount < 0) {
      const factor = 1 + amount / 50;
      r *= factor; g *= factor; b *= factor;
    } else {
      r += (255 - r) * (amount / 50);
      g += (255 - g) * (amount / 50);
      b += (255 - b) * (amount / 50);
    }

    return {
      r: Math.round(r),
      g: Math.round(g),
      b: Math.round(b)
    };
  }

  updateSliderBackground() {
    const { r, g, b } = this.baseColor;

    this.shadeSliderRef.nativeElement.style.background =
      `linear-gradient(to right, black, rgb(${r},${g},${b}), white)`;
  }

  // ---------------- COLOR UTILS ----------------

  hslToRgb(h: number, s: number, l: number): number[] {
    s /= 100;
    l /= 100;

    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) =>
      l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

    return [
      Math.round(255 * f(0)),
      Math.round(255 * f(8)),
      Math.round(255 * f(4))
    ];
  }

  rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b]
      .map(x => x.toString(16).padStart(2, '0'))
      .join('');
  }

  // ---------------- CONTROL VALUE ACCESSOR ----------------

  writeValue(value: string): void {
    if (!value || !value.startsWith('#')) return;
    // Only preview update (no reverse wheel mapping)
  }

  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled = isDisabled; }

  emitValue() {
    this.onChange(this.hexColor);
  }

  get hexColor(): string {
    const shaded = this.adjustShade(this.shade);
    return this.rgbToHex(shaded.r, shaded.g, shaded.b);
  }
}
