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
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ColorPickerComponent),
      multi: true
    }
  ]
})
export class ColorPickerComponent
  implements AfterViewInit, ControlValueAccessor {

  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  ctx!: CanvasRenderingContext2D;
  offscreen!: HTMLCanvasElement;
  offCtx!: CanvasRenderingContext2D;

  size = 300;
  radius = 150;
  center = 150;

  selector = { x: 150, y: 150 };

  h = 0;
  s = 0;
  l = 50;
  a = 1;

  disabled = false;

  // ControlValueAccessor hooks
  private onChange: any = () => {};
  private onTouched: any = () => {};

  ngAfterViewInit() {
    this.setupCanvas();
    this.generateWheel();
    this.render();
  }

  // --- ControlValueAccessor API ---

  writeValue(value: string): void {
    if (!value) return;

    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return;

    const parts = match[1].split(',').map(v => parseFloat(v));
    const [r, g, b, alpha] = parts;

    this.a = alpha ?? 1;

    // convert RGB → HSL
    const { h, s, l } = this.rgbToHsl(r, g, b);
    this.h = h;
    this.s = s;
    this.l = l;

    this.updateSelectorFromHsl();
    this.render();
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  emitValue() {
    this.onChange(this.rgbaColor);
  }

  // --- Canvas Setup ---

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

  handlePointer(event: PointerEvent) {
    if (this.disabled) return;

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
    this.updateColorFromSelector();
    this.emitValue();
    this.render();
  }

  updateColorFromSelector() {
    const dx = this.selector.x - this.center;
    const dy = this.selector.y - this.center;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    this.h = (angle * 180 / Math.PI + 360) % 360;
    this.s = Math.min((distance / this.radius) * 100, 100);
  }

  updateSelectorFromHsl() {
    const angle = this.h * Math.PI / 180;
    const r = (this.s / 100) * this.radius;

    this.selector.x = this.center + r * Math.cos(angle);
    this.selector.y = this.center + r * Math.sin(angle);
  }

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

  rgbToHsl(r: number, g: number, b: number) {
    r /= 255; g /= 255; b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }

      h *= 60;
    }

    return { h, s: s * 100, l: l * 100 };
  }

  get rgbaColor(): string {
    const [r, g, b] = this.hslToRgb(this.h, this.s, this.l);
    return `rgba(${r},${g},${b},${this.a})`;
  }
}
