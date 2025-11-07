import { Component, ChangeDetectionStrategy, ElementRef, ViewChild, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { ThreeService } from './services/three.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  providers: [ThreeService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('rendererCanvas', { static: true })
  rendererCanvas!: ElementRef<HTMLCanvasElement>;
  
  public threeService = inject(ThreeService);

  ngAfterViewInit(): void {
    if (this.rendererCanvas) {
      this.threeService.init(this.rendererCanvas.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.threeService.cleanup();
  }
}