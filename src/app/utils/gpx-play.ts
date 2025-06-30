import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import { toLonLat } from 'ol/proj';
import { getDistance } from 'ol/sphere';
import { Chart } from 'chart.js';
import { updateChartHighlight } from './elevation-chart';

export interface InfoPanelData {
    elevation: string;
    slope: string;
    travelled: string;
    remaining: string;
}

export class GpxPlayer {
    private index = 0;
    private timer: any = null;
    private intervalMs = 100; // 100 ms por defecto (1x)
    private stepSize = 1; // cuántos puntos avanzar por paso

    constructor(
        private coords: [number, number, number][],
        private marker: Feature<Point>,
        private updateInfo: (info: InfoPanelData) => void,
        private updateBox: (coord: [number, number], elev: number, slope: number, travelled: number, remaining: number) => void,
        private chart?: Chart
    ) { }

    isPlaying = false;

    toggle() {
        this.isPlaying ? this.stop() : this.start();
    }

    // start() {
    //     if (!this.coords.length) return;
    //     this.isPlaying = true;
    //     this.index = 0;

    //     this.timer = setInterval(() => {
    //         if (this.index >= this.coords.length - 1) {
    //             this.stop();
    //             return;
    //         }

    //         const [x, y, z] = this.coords[this.index];
    //         const coord = [x, y] as [number, number];
    //         const elev = z;
    //         const [x2, y2, z2] = this.coords[this.index + 1];
    //         const slope = this.calcSlope([x, y, z], [x2, y2, z2]);

    //         const travelled = this.calcTravelled(this.index);
    //         const total = this.calcTravelled(this.coords.length - 1);
    //         const remaining = total - travelled;

    //         this.marker.getGeometry()?.setCoordinates(coord);
    //         this.updateBox(coord, elev, slope, travelled / 1000, remaining / 1000);
    //         this.updateInfo({
    //             elevation: elev.toFixed(0),
    //             slope: slope.toFixed(1),
    //             travelled: (travelled / 1000).toFixed(2),
    //             remaining: (remaining / 1000).toFixed(2)
    //         });

    //         if (this.chart) updateChartHighlight(this.chart, this.index);

    //         this.index++;
    //     }, this.intervalMs);
    // }

    start() {
        if (!this.coords.length) return;

        this.isPlaying = true;

        this.timer = setInterval(() => {
            const nextIndex = this.index + this.stepSize;

            if (nextIndex >= this.coords.length) {
                this.stop();
                return;
            }

            const [x, y, z] = this.coords[this.index];
            const coord = [x, y] as [number, number];
            const elev = z;

            const [x2, y2, z2] = this.coords[nextIndex] ?? this.coords[this.index];
            const slope = this.calcSlope([x, y, z], [x2, y2, z2]);

            const travelled = this.calcTravelled(this.index);
            const total = this.calcTravelled(this.coords.length - 1);
            const remaining = total - travelled;

            // Mueve el marcador
            this.marker.getGeometry()?.setCoordinates(coord);
            this.updateBox(coord, elev, slope, travelled / 1000, remaining / 1000);
            this.updateInfo({
                elevation: elev.toFixed(0),
                slope: slope.toFixed(1),
                travelled: (travelled / 1000).toFixed(2),
                remaining: (remaining / 1000).toFixed(2)
            });

            // Actualiza el gráfico
            if (this.chart) updateChartHighlight(this.chart, this.index);

            // Avanza al siguiente índice
            this.index = nextIndex;

        }, this.intervalMs);
    }


    stop() {
        this.isPlaying = false;
        clearInterval(this.timer);
        this.timer = null;
    }

    private calcSlope(p1: [number, number, number], p2: [number, number, number]): number {
        const dist = getDistance(toLonLat([p1[0], p1[1]]), toLonLat([p2[0], p2[1]]));
        return dist > 0 ? ((p2[2] - p1[2]) / dist) * 100 : 0;
    }

    private calcTravelled(index: number): number {
        let distance = 0;
        for (let i = 1; i <= index; i++) {
            const [x1, y1] = this.coords[i - 1];
            const [x2, y2] = this.coords[i];
            distance += getDistance(toLonLat([x1, y1]), toLonLat([x2, y2]));
        }
        return distance;
    }

    // setSpeed(multiplier: number): void {
    //     this.intervalMs = 100 / multiplier;

    //     if (this.isPlaying) {
    //         this.stop();  // reinicia el temporizador con la nueva velocidad
    //         this.start();
    //     }
    // }

    // setSpeed(multiplier: number): void {
    //     // Define el número de pasos que avanza por cada tick
    //     this.stepSize = Math.floor(multiplier);

    //     // Intervalo por tick (reduce velocidad cuanto más grande el step)
    //     this.intervalMs = 100;

    //     if (this.isPlaying) {
    //         this.stop();
    //         this.start();
    //     }
    // }
    setSpeed(multiplier: number): void {
  this.stepSize = Math.floor(multiplier);
  this.intervalMs = 100;

  if (this.isPlaying) {
    this.stop();
    this.start(); // reinicia con nueva velocidad
  }
}



    // reset(): void {
    //     this.stop();
    //     this.index = 0;
    // }

    reset(): void {
        this.stop();
        this.index = 0;

        if (!this.coords.length) return;

        const [x, y, z] = this.coords[0];
        const coord = [x, y] as [number, number];
        const elev = z;

        const next = this.coords[1] ?? this.coords[0];
        const slope = this.calcSlope([x, y, z], next);

        const travelled = 0;
        const total = this.calcTravelled(this.coords.length - 1);
        const remaining = total;

        // Mueve el marcador al inicio
        this.marker.getGeometry()?.setCoordinates(coord);

        // Actualiza el popup del marcador
        this.updateBox(coord, elev, slope, travelled / 1000, remaining / 1000);

        // Actualiza el info-panel
        this.updateInfo({
            elevation: elev.toFixed(0),
            slope: slope.toFixed(1),
            travelled: '0.00',
            remaining: (remaining / 1000).toFixed(2),
        });

        // Actualiza el gráfico
        if (this.chart) {
            updateChartHighlight(this.chart, 0);
        }
    }



}
