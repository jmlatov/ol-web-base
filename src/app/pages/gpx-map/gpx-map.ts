import { Component, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Overlay from 'ol/Overlay';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Stroke, Style, Icon } from 'ol/style';
import Point from 'ol/geom/Point';
import { defaults as defaultControls, Attribution, FullScreen, Zoom, Control } from 'ol/control';
import { getDistance } from 'ol/sphere';
import { LineString } from 'ol/geom';
import Feature from 'ol/Feature';
import Chart from 'chart.js/auto';
import { drawElevationChart, updateChartHighlight } from '../../utils/elevation-chart';

@Component({
  selector: 'app-gpx-map',
  templateUrl: './gpx-map.html',
  styleUrls: ['./gpx-map.css'],
  standalone: true,
})
export class GpxMap implements AfterViewInit {
  gpxTracks = [
    { name: 'Track Zaragoza', path: 'assets/track.gpx' },
    { name: 'BTT Algars 2023', path: 'assets/ii-btt-algars-fabara-2023.gpx' },
    { name: 'BTT Algars 2025 - Corta', path: 'assets/track2.gpx' },
    { name: 'BTT Algars 2025 - Larga', path: 'assets/track3.gpx' },
  ];

  private markerOverlay!: Overlay;
  private markerInfoContent!: HTMLElement;

  // Declaro @ViewChild para el canvas del gráfico
  @ViewChild('elevationCanvas') elevationCanvasRef!: ElementRef<HTMLCanvasElement>;

  private lastChartIndex = -1;


  private map!: OlMap;
  private source = new VectorSource();
  private waypointData: Map<string, { name: string; desc?: string; image?: string; info?: string }> = new Map();

  //private elevationChart!: Chart;

  private elevationChart: Chart | null = null;
  private markerFeature = new Feature(new Point([0, 0]));

  // Para tener dos capas de mapa: OSM y satélite
  private osmLayer = new TileLayer({
    source: new OSM(),
    visible: true,
  });

  private satelliteLayer = new TileLayer({
    source: new XYZ({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attributions: 'Tiles © Esri',
    }),
    visible: false,
  });

  // Añadido para info adicional
  info = {
    elevation: '-',
    slope: '-',
    //totalDistance: '-',
    travelled: '-',
    remaining: '-'
  };

  private fullLineString: LineString | null = null;
  private fullCoords: [number, number, number][] = [];
  legendExpanded = true;

  toggleLegend(): void {
    this.legendExpanded = !this.legendExpanded;
  }

  private vectorLayer = new VectorLayer({
    source: this.source,
    style: (feature) => {
      const geometry = feature.getGeometry?.();
      if (!geometry) return undefined;

      const type = geometry.getType();

      if (type === 'LineString' || type === 'MultiLineString') {
        const color = feature.get('slopeColor') || '#999999';
        return new Style({
          stroke: new Stroke({ color, width: 5 }),
        });
      }

      if (feature === this.markerFeature) {
        return new Style({
          image: new Icon({
            src: 'assets/icons/bike.svg', // usa tu icono de marcador
            scale: 0.5,
            anchor: [0.5, 0.5],
          }),
        });
      }

      if (type === 'Point') {
        return new Style({
          image: new Icon({
            src: 'assets/icons/10160509.png',
            scale: 0.15,
            anchor: [1, 1],
          }),
        });
      }

      return undefined;
    },
  });


  ngAfterViewInit(): void {
    const popupContainer = document.getElementById('popup')!;
    const popupContent = document.getElementById('popup-content')!;
    const popupCloser = document.getElementById('popup-closer')!;

    const overlay = new Overlay({
      element: popupContainer,
      autoPan: { animation: { duration: 250 } },
    });

    popupCloser.onclick = () => {
      overlay.setPosition(undefined);
      return false;
    };

    this.map = new OlMap({
      target: 'map',
      //layers: [new TileLayer({ source: new OSM() }), this.vectorLayer],
      layers: [this.osmLayer, this.satelliteLayer, this.vectorLayer],
      overlays: [overlay],
      view: new View({
        center: fromLonLat([0, 0]),
        zoom: 2,
      }),
      controls: [],
    });

    this.map.addControl(new Attribution({
      collapsible: false,
      target: 'legend-box',
      className: 'ol-attribution-bottom-right'
    }));
    // Añado este código para eliminar el botón de "Attribution" que aparece por defecto
    // Espera un poco para que se renderice el control y luego elimina el botón
    setTimeout(() => {
      const button = document.querySelector('.ol-attribution-bottom-right button');
      if (button) {
        button.remove(); // 💥 Elimina el botón manualmente
      }
    }, 1); // espera 1ms; ajusta si es necesario

    this.map.addControl(new Zoom({
      zoomInLabel: 'Acercar +',
      zoomOutLabel: 'Alejar -'
    }));

    this.map.addControl(new FullScreen({
      className: 'ol-full-screen-custom'
    }));

    this.markerInfoContent = document.getElementById('marker-info-content')!;

    this.markerOverlay = new Overlay({
      element: document.getElementById('marker-info')!,
      positioning: 'bottom-center',
      stopEvent: false,
      offset: [0, -15],
    });
    this.map.addOverlay(this.markerOverlay);


    this.map.on('click', (evt) => {
      const feature = this.map.forEachFeatureAtPixel(evt.pixel, (feat) => {
        const geometry = feat.getGeometry?.();
        if (geometry instanceof Point) return feat;
        return null;
      });

      if (feature) {
        const geometry = feature.getGeometry();
        if (geometry instanceof Point) {
          const [x, y] = geometry.getCoordinates();
          const [lon, lat] = toLonLat([x, y]);
          const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
          const data = this.waypointData.get(key);

          if (data) {
            popupContent.innerHTML = `
              <strong>${data.name}</strong><br>
              ${data.desc ? `<em>${data.desc}</em><br>` : ''}
              ${data.image ? `<img src="${data.image}" style="max-width:150px; display:block; margin:5px 0;">` : ''}
              ${data.info ? `<div>${data.info}</div>` : ''}
            `;
            overlay.setPosition([x, y]);
          }
        }
      } else {
        overlay.setPosition(undefined);
      }
    });

    this.loadTrack(this.gpxTracks[0].path);

    this.map.on('pointermove', (evt) => {
      if (!this.fullLineString || this.fullCoords.length < 2) return;

      const coordinate = evt.coordinate;
      const closest = this.fullLineString.getClosestPoint(coordinate);

      // Encontrar el tramo más cercano
      let iClosest = -1;
      let minDist = Infinity;
      for (let i = 1; i < this.fullCoords.length; i++) {
        const [x1, y1] = this.fullCoords[i - 1];
        const [x2, y2] = this.fullCoords[i];
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const dist = Math.hypot(midX - closest[0], midY - closest[1]);
        if (dist < minDist) {
          minDist = dist;
          iClosest = i;
        }
      }

      if (iClosest > 0) {
        const [x1, y1, z1] = this.fullCoords[iClosest - 1];
        const [x2, y2, z2] = this.fullCoords[iClosest];

        const lonLat1 = toLonLat([x1, y1]);
        const lonLat2 = toLonLat([x2, y2]);

        const elev = (z1 + z2) / 2;
        const dist = getDistance(lonLat1, lonLat2);
        const slope = dist > 0 ? ((z2 - z1) / dist) * 100 : 0;

        this.info.elevation = elev.toFixed(0);
        this.info.slope = slope.toFixed(1);

        // Calcular distancia recorrida
        let travelled = 0;
        const coords2D = this.fullCoords.map(([x, y]) => [x, y]);

        for (let i = 1; i < coords2D.length; i++) {
          const c1 = coords2D[i - 1];
          const c2 = coords2D[i];

          // Si el punto actual está más allá del punto más cercano, nos detenemos
          const line = new LineString([c1, c2]);
          const segmentClosest = line.getClosestPoint(closest);
          const isOnSegment = segmentClosest[0] === closest[0] && segmentClosest[1] === closest[1];

          if (isOnSegment) {
            travelled += getDistance(toLonLat(c1), toLonLat(closest));
            break;
          } else {
            travelled += getDistance(toLonLat(c1), toLonLat(c2));
          }
        }

        if (this.elevationChart && iClosest !== this.lastChartIndex) {
          updateChartHighlight(this.elevationChart, iClosest);
          this.lastChartIndex = iClosest;
        }

        const total = this.fullLineString.getLength();

        this.info.travelled = (travelled / 1000).toFixed(2);
        this.info.remaining = ((total - travelled) / 1000).toFixed(2);

        this.updateMarkerInfoBox([closest[0], closest[1]], elev, slope, travelled / 1000, (total - travelled) / 1000);

      }
    });

    const mapElement = document.getElementById('map');

mapElement?.addEventListener('mouseleave', () => {
  this.markerOverlay.setPosition(undefined);
});

mapElement?.addEventListener('mouseenter', () => {
  // Si quieres que vuelva a aparecer al entrar, solo si hay coordenadas
  if (this.markerFeature.getGeometry()) {
    const coord = this.markerFeature.getGeometry()!.getCoordinates();
    const elev = parseFloat(this.info.elevation);
    const slope = parseFloat(this.info.slope);
    const travelled = parseFloat(this.info.travelled);
    const remaining = parseFloat(this.info.remaining);
    this.updateMarkerInfoBox([coord[0], coord[1]], elev, slope, travelled, remaining);
  }
});

  }

  onTrackSelect(event: Event): void {
    const path = (event.target as HTMLSelectElement).value;
    this.loadTrack(path);
  }

  private loadTrack(path: string): void {
    this.source.clear();
    this.waypointData.clear();

    fetch(path)
      .then((res) => res.text())
      .then((xmlText) => {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, 'application/xml');

        // 📍 Waypoints
        const wpts = Array.from(xml.getElementsByTagName('wpt'));
        for (const wpt of wpts) {
          const lat = parseFloat(wpt.getAttribute('lat')!);
          const lon = parseFloat(wpt.getAttribute('lon')!);
          const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
          const name = wpt.getElementsByTagName('name')[0]?.textContent ?? '';
          const desc = wpt.getElementsByTagName('desc')[0]?.textContent ?? '';
          const image = wpt.getElementsByTagNameNS('*', 'image')[0]?.textContent ?? '';
          const info = wpt.getElementsByTagNameNS('*', 'info')[0]?.textContent ?? '';

          this.waypointData.set(key, { name, desc, image, info });

          // ➕ Añadir como Feature de tipo Point
          const coords = fromLonLat([lon, lat]);
          const point = new Point(coords);
          const feature = new Feature(point);
          feature.set('name', name); // por si lo necesitas después
          this.source.addFeature(feature);
        }

        // 📈 Extraer puntos del track
        const trkpts = Array.from(xml.getElementsByTagName('trkpt'));
        const coordinates: [number, number, number][] = [];

        for (const pt of trkpts) {
          const lat = parseFloat(pt.getAttribute('lat')!);
          const lon = parseFloat(pt.getAttribute('lon')!);
          const eleText = pt.getElementsByTagName('ele')[0]?.textContent;
          const ele = eleText ? parseFloat(eleText) : 0;
          const [x, y] = fromLonLat([lon, lat]);
          coordinates.push([x, y, ele]);
        }

        this.assignSlopeColors(coordinates);

        if (coordinates.length > 0) {
          const extent = this.source.getExtent();
          if (extent && extent[0] !== Infinity) {
            this.map.getView().fit(extent, { padding: [40, 40, 40, 40], duration: 800 });
          }
        }

        this.fullCoords = coordinates;
        this.fullLineString = new LineString(coordinates.map(([x, y]) => [x, y]));

        this.source.addFeature(this.markerFeature); // Añadir marcador al mapa

        //Usar la referencia de @ViewChild para el canvas
        requestAnimationFrame(() => {
          const canvas = this.elevationCanvasRef?.nativeElement;

          if (canvas) {
            const chartRef = { current: this.elevationChart };

            drawElevationChart(
              canvas,
              coordinates,
              this.resizeCanvasToFixedHeight.bind(this),
              this.markerFeature,
              chartRef
            );

            this.elevationChart = chartRef.current;
          }
        });


      });
  }

  private assignSlopeColors(coords: [number, number, number][]): void {
    for (let i = 1; i < coords.length; i++) {
      const [x1, y1, z1] = coords[i - 1];
      const [x2, y2, z2] = coords[i];

      const lonLat1 = toLonLat([x1, y1]);
      const lonLat2 = toLonLat([x2, y2]);

      const distance = getDistance(lonLat1, lonLat2);
      const elevationChange = z2 - z1;
      const slopePercent = distance > 0 ? (elevationChange / distance) * 100 : 0;

      const line = new LineString([[x1, y1], [x2, y2]]);
      const feature = new Feature({ geometry: line });
      feature.set('slopePercent', slopePercent);
      feature.set('slopeColor', this.getSlopeColor(slopePercent));

      this.source.addFeature(feature);
    }
  }

  private getSlopeColor(slope: number): string {
    // Clamp pendiente entre -20% y +20%
    const clamped = Math.max(-20, Math.min(20, slope));
    const t = (clamped + 20) / 40; // Normalizar de [-20, 20] → [0, 1]

    // Interpolación entre azul → verde → rojo
    let r, g, b;

    if (t < 0.5) {
      // Azul → Verde
      const t2 = t * 2;
      r = 0;
      g = Math.round(255 * t2);
      b = Math.round(255 * (1 - t2));
    } else {
      // Verde → Rojo
      const t2 = (t - 0.5) * 2;
      r = Math.round(255 * t2);
      g = Math.round(255 * (1 - t2));
      b = 0;
    }

    return `rgb(${r},${g},${b})`;
  }

  onBaseLayerChange(event: Event): void {
    const selected = (event.target as HTMLSelectElement).value;
    this.osmLayer.setVisible(selected === 'osm');
    this.satelliteLayer.setVisible(selected === 'satellite');
  }

  private resizeCanvasToFixedHeight(canvas: HTMLCanvasElement, heightPx: number): void {
    const pixelRatio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const displayWidth = Math.floor(width * pixelRatio);
    const displayHeight = Math.floor(heightPx * pixelRatio);

    canvas.style.height = `${heightPx}px`; // visual height
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }

  private updateMarkerInfoBox(coord: [number, number], elev: number, slope: number, travelled: number, remaining: number) {
    this.markerOverlay.setPosition(coord);
    this.markerInfoContent.innerHTML = `
    <strong>${elev.toFixed(0)} m</strong><br>
    Pendiente: ${slope.toFixed(1)}%<br>
    Recorrido: ${travelled.toFixed(2)} km<br>
    Restante: ${remaining.toFixed(2)} km
  `;
  }


}
