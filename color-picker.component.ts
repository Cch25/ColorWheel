import {
  Component,
  ElementRef,
  ViewChild,
  Input,
  OnDestroy,
  AfterViewInit,
  ChangeDetectionStrategy,
  forwardRef,
  NgZone,
  signal,
  computed,
  effect,
  input,
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  NG_VALIDATORS,
  Validator,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';

import {
  RgbColor,
  rgbToHex,
  rgbToHsv,
  hexToRgb,
  hsvToRgb,
  applyShade,
  hueSatToWheelPos,
  wheelPosToHue,
  wheelPosToSat,
  drawColorWheel,
} from './color-utils';

const DEFAULT_HEX = '#262aff';

@Component({
  selector: 'app-color-picker',
  standalone: true,
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ColorPickerComponent),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => ColorPickerComponent),
      multi: true,
    },
  ],
})
export class ColorPickerComponent
  implements ControlValueAccessor, Validator, AfterViewInit, OnDestroy
{
  // ── Inputs (signal-based) ─────────────────────────────────────────────────

  readonly label    = input('');
  readonly disabled = input(false);

  // ── View refs ─────────────────────────────────────────────────────────────

  @ViewChild('wheelCanvas') wheelCanvasRef!: ElementRef<HTMLCanvasElement>;

  // ── Writable signals ──────────────────────────────────────────────────────

  readonly shade      = signal(0);      // –50 … +50
  readonly sat        = signal(85);     // 0 … 100  (slider integer)
  readonly hexValue   = signal(DEFAULT_HEX);
  readonly rgbValue   = signal('38, 42, 255');
  readonly isDisabled = signal(false);

  // ── Computed signals ──────────────────────────────────────────────────────

  readonly shadeSliderBg = computed(() => {
    const { r, g, b } = this._baseColor();
    return `linear-gradient(to right, black 0%, rgb(${r},${g},${b}) 50%, white 100%)`;
  });

  readonly satSliderBg = computed(() => {
    const { r, g, b } = hsvToRgb(this._hue(), 1, 1);
    return `linear-gradient(to right, rgb(128,128,128) 0%, rgb(${r},${g},${b}) 100%)`;
  });

  // ── Private signals ───────────────────────────────────────────────────────

  private readonly _hue       = signal(239);
  private readonly _sat       = signal(0.85);
  private readonly _baseColor = signal<RgbColor>({ r: 38, g: 42, b: 255 });
  private readonly _selectorX = signal(0);
  private readonly _selectorY = signal(0);

  // ── Private fields ────────────────────────────────────────────────────────

  private _dragging   = false;
  private _canvasSize = 0;

  private _wheelCanvas!: HTMLCanvasElement;
  private _wheelCtx!:    CanvasRenderingContext2D;
  private _displayCtx!:  CanvasRenderingContext2D;
  private _resizeObserver!: ResizeObserver;

  // ── CVA callbacks ─────────────────────────────────────────────────────────

  private _onChange:   (v: string) => void = () => {};
  private _onTouched:  () => void           = () => {};

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor(private readonly _ngZone: NgZone) {
    // Reactively update the output hex whenever shade, baseColor or sat changes
    effect(() => {
      const shaded      = applyShade(this._baseColor(), this.shade());
      const hex         = rgbToHex(shaded);
      this.hexValue.set(hex);
      this.rgbValue.set(`${shaded.r}, ${shaded.g}, ${shaded.b}`);
      this._onChange(hex);
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    this._wheelCanvas = document.createElement('canvas');
    this._wheelCtx    = this._wheelCanvas.getContext('2d', { willReadFrequently: true })!;
    this._displayCtx  = this.wheelCanvasRef.nativeElement.getContext('2d')!;

    this._ngZone.runOutsideAngular(() => {
      const el = this.wheelCanvasRef.nativeElement;
      el.addEventListener('pointerdown',   this._onPointerDown);
      el.addEventListener('pointermove',   this._onPointerMove);
      el.addEventListener('pointerup',     this._onPointerUp);
      el.addEventListener('pointercancel', this._onPointerUp);

      this._resizeObserver = new ResizeObserver(() => this._initCanvas());
      this._resizeObserver.observe(el);
    });

    this._initCanvas();
  }

  ngOnDestroy(): void {
    const el = this.wheelCanvasRef?.nativeElement;
    if (el) {
      el.removeEventListener('pointerdown',   this._onPointerDown);
      el.removeEventListener('pointermove',   this._onPointerMove);
      el.removeEventListener('pointerup',     this._onPointerUp);
      el.removeEventListener('pointercancel', this._onPointerUp);
    }
    this._resizeObserver?.disconnect();
  }

  // ── ControlValueAccessor ──────────────────────────────────────────────────

  writeValue(hex: string | null): void {
    const rgb = hexToRgb(hex ?? DEFAULT_HEX) ?? hexToRgb(DEFAULT_HEX)!;
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

    this._hue.set(hsv.h);
    this._sat.set(hsv.s);
    this.sat.set(Math.round(hsv.s * 100));
    this.shade.set(0);
    this._baseColor.set(rgb);

    if (this._canvasSize > 0) {
      this._syncSelectorToHueSat();
      this._render();
    }
  }

  registerOnChange(fn: (v: string) => void): void { this._onChange   = fn; }
  registerOnTouched(fn: () => void): void          { this._onTouched  = fn; }

  setDisabledState(val: boolean): void {
    this.isDisabled.set(val);
  }

  // ── Validator ─────────────────────────────────────────────────────────────

  validate(_control: AbstractControl): ValidationErrors | null {
    return /^#[0-9a-f]{6}$/i.test(this.hexValue()) ? null : { invalidColor: true };
  }

  // ── Template event handlers ───────────────────────────────────────────────

  onShadeChange(event: Event): void {
    this.shade.set(Number((event.target as HTMLInputElement).value));
  }

  onSatChange(event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    this.sat.set(val);
    this._sat.set(val / 100);
    this._syncSelectorToHueSat();
    this._pickColorAtSelector();
    this._render();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _initCanvas(): void {
    const el      = this.wheelCanvasRef.nativeElement;
    const cssSize = el.clientWidth || Math.min(window.innerWidth * 0.82, 420);
    const dpr     = Math.max(1, Math.floor(devicePixelRatio || 1));
    const size    = Math.round(cssSize * dpr);

    el.width  = size;
    el.height = size;
    el.style.width  = `${cssSize}px`;
    el.style.height = `${cssSize}px`;

    this._canvasSize = size;
    this._wheelCanvas.width  = size;
    this._wheelCanvas.height = size;

    drawColorWheel(this._wheelCtx, size);
    this._syncSelectorToHueSat();
    this._pickColorAtSelector();
    this._render();
  }

  private _syncSelectorToHueSat(): void {
    const pos = hueSatToWheelPos(this._hue(), this._sat(), this._canvasSize);
    this._selectorX.set(pos.x);
    this._selectorY.set(pos.y);
  }

  private _pickColorAtSelector(): void {
    const size = this._canvasSize;
    const cx   = Math.max(0, Math.min(size - 1, Math.round(this._selectorX())));
    const cy   = Math.max(0, Math.min(size - 1, Math.round(this._selectorY())));
    const px   = this._wheelCtx.getImageData(cx, cy, 1, 1).data;
    this._baseColor.set({ r: px[0], g: px[1], b: px[2] });
  }

  private _render(): void {
    const ctx  = this._displayCtx;
    const size = this._canvasSize;
    if (!ctx || !size) return;

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this._wheelCanvas, 0, 0);

    ctx.beginPath();
    ctx.arc(this._selectorX(), this._selectorY(), 12, 0, Math.PI * 2);
    ctx.lineWidth   = 4;
    ctx.strokeStyle = 'white';
    ctx.stroke();
  }

  // ── Pointer events (outside Angular zone) ────────────────────────────────

  private readonly _onPointerDown = (e: PointerEvent): void => {
    if (this.isDisabled()) return;
    this._dragging = true;
    this._onTouched();
    this._handlePointer(e);
  };

  private readonly _onPointerMove = (e: PointerEvent): void => {
    if (!this._dragging) return;
    this._handlePointer(e);
  };

  private readonly _onPointerUp = (): void => {
    this._dragging = false;
  };

  private _handlePointer(e: PointerEvent): void {
    const el    = this.wheelCanvasRef.nativeElement;
    const rect  = el.getBoundingClientRect();
    const scale = this._canvasSize / rect.width;
    const x     = (e.clientX - rect.left) * scale;
    const y     = (e.clientY - rect.top)  * scale;

    this._selectorX.set(x);
    this._selectorY.set(y);
    this._hue.set(wheelPosToHue(x, y, this._canvasSize));
    this._sat.set(wheelPosToSat(x, y, this._canvasSize));

    this._ngZone.run(() => {
      this.sat.set(Math.round(this._sat() * 100));
    });

    this._pickColorAtSelector();
    this._render();
  }
}
