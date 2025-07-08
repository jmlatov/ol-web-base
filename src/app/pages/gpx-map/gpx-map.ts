import { Component, AfterViewInit, ViewChild, ElementRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
import { GpxPlayer } from '../../utils/gpx-play';
import { ResetViewControl, evaluateResetVisibility } from '../../utils/reset-view-control';

@Component({
  selector: 'app-gpx-map',
  templateUrl: './gpx-map.html',
  styleUrls: ['./gpx-map.css'],
  standalone: true,
  imports: [
    CommonModule,
  ],
})

export class GpxMap implements AfterViewInit, OnInit {

  isPlaying: boolean = false;
  private gpxPlayer: GpxPlayer | null = null;

  private http = inject(HttpClient);

  gpxTracks: { name: string; path: string }[] = [];

  private mapReady = false;

  ngOnInit(): void {
    this.loadTrackList();
  }

  private initialTrackPath: string | null = null;

  private loadTrackList(): void {
    this.http.get<{ name: string; path: string }[]>('assets/tracks.json').subscribe({
      next: (tracks) => {
        this.gpxTracks = tracks;
        if (tracks.length > 0) {
          this.initialTrackPath = tracks[0].path;
          this.tryLoadInitialTrack();
        }
      },
      error: (err) => {
        console.error('Error cargando tracks.json:', err);
      }
    });
  }

  private tryLoadInitialTrack(): void {
    if (this.mapReady && this.initialTrackPath) {
      this.loadTrack(this.initialTrackPath);
      this.initialTrackPath = null; // ya no hace falta
    }
  }

  private markerOverlay!: Overlay;
  private markerInfoContent!: HTMLElement;

  // Declaro @ViewChild para el canvas del gráfico
  @ViewChild('elevationCanvas') elevationCanvasRef!: ElementRef<HTMLCanvasElement>;

  private lastChartIndex = -1;

  private map!: OlMap;
  private source = new VectorSource();
  private waypointData: Map<string, { name: string; desc?: string; image?: string; info?: string; type?: string }> = new Map();
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

  // Añadido para manejar el cambio de capa base
  // Declaro una variable para guardar el extent inicial
  // Esto es útil si quieres volver a este extent después de cambiar la capa base
  // Puedes usarlo para ajustar la vista del mapa al cargar un track
  // Esto es opcional, pero puede ser útil si quieres mantener la vista del mapa consistente
  // Puedes eliminarlo si no lo necesitas
  private initialExtent: [number, number, number, number] | null = null;

  // Añadido para el botón de resetear vista
  private resetControl!: ResetViewControl;

  // Añadido para guardar el centro y zoom iniciales
  private initialCenter: [number, number] | null = null;
  private initialZoom: number | null = null;

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
        const featureType = feature.get('type'); // <<==== este es el tipo que cargaste del GPX
        let iconPath = 'assets/icons/default.svg'; // por defecto

        if (featureType === 'monument') {
          iconPath = 'assets/icons/monument.svg';
        } else if (featureType === 'water') {
          iconPath = 'assets/icons/water.svg';
        } else if (featureType === 'viewpoint') {
          iconPath = 'assets/icons/camera.svg';
        }

        return new Style({
          image: new Icon({
            src: iconPath,
            scale: 0.5,
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

    // Añadido para el botón de resetear vista
    // Este botón se mostrará solo si hay un extent inicial
    // y se ocultará después de hacer clic en él para resetear la vista
    // Puedes cambiar el icono o el texto del botón según tus preferencias
    // Puedes usar un icono de FontAwesome o cualquier otro icono que prefieras
    // Aquí he usado un emoji de flecha circular, pero puedes cambiarlo por cualquier otro
    // Puedes usar un icono SVG o una imagen si lo prefieres
    this.resetControl = new ResetViewControl(() => {
      if (this.initialCenter && this.initialZoom !== null) {
        this.map.getView().setCenter(this.initialCenter);
        this.map.getView().setZoom(this.initialZoom);
        this.resetControl.hide();
      }
    });
    this.map.addControl(this.resetControl);
    // this.map.getView().on('change:center', () => this.evaluateResetVisibility());
    // this.map.getView().on('change:resolution', () => this.evaluateResetVisibility());
    this.map.getView().on('change:center', () =>
      evaluateResetVisibility(this.map, this.resetControl, this.initialCenter, this.initialZoom, this.coordsAreClose.bind(this))
    );
    this.map.getView().on('change:resolution', () =>
      evaluateResetVisibility(this.map, this.resetControl, this.initialCenter, this.initialZoom, this.coordsAreClose.bind(this))
    );


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

    this.map.on('pointermove', (evt) => {
      if (!this.fullLineString || this.fullCoords.length < 2) return;

      const coordinate = evt.coordinate;
      const closest = this.fullLineString.getClosestPoint(coordinate);

      // Calcula la distancia entre el cursor y el punto más cercano del track
      const distanceToTrack = Math.hypot(
        coordinate[0] - closest[0],
        coordinate[1] - closest[1]
      );

      // Define un umbral en unidades de mapa (por ejemplo, metros si usas proyección geográfica)
      const threshold = 50; // ajusta este valor según la escala de tu mapa (puede ser 10–50)

      // Si está lejos del track, ocultar la info
      if (distanceToTrack > threshold) {
        this.markerOverlay.setPosition(undefined);
        this.markerInfoContent.innerHTML = '';
        return;
      }


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

        // Diagnósticando de nuevo si carga la información correctamente
        //console.log('Información del marcador:', this.info);

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
    this.mapReady = true;
    this.tryLoadInitialTrack();
  }

  onTrackSelect(event: Event): void {
    const path = (event.target as HTMLSelectElement).value;
    this.loadTrack(path);
  }

  private loadTrack(path: string): void {

    // Diganósticando el código para ver si se está llamando correctamente
    //console.log('Cargando track desde:', path);

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
          const type = wpt.getElementsByTagName('type')[0]?.textContent ?? '';
          const desc = wpt.getElementsByTagName('desc')[0]?.textContent ?? '';
          const image = wpt.getElementsByTagNameNS('*', 'image')[0]?.textContent ?? '';
          const info = wpt.getElementsByTagNameNS('*', 'info')[0]?.textContent ?? '';

          this.waypointData.set(key, { name, type, desc, image, info });
          //console.log(`Waypoint: ${name} (${lat}, ${lon}) - Type: ${type}`);

          // ➕ Añadir como Feature de tipo Point
          const coords = fromLonLat([lon, lat]);
          const point = new Point(coords);
          const feature = new Feature(point);
          feature.set('name', name); // por si lo necesitas después
          feature.set('type', type);
          this.source.addFeature(feature);
          //console.log(feature);
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
          if (extent && extent.length === 4 && Infinity) {
            this.initialExtent = [extent[0], extent[1], extent[2], extent[3]]; // 👈 Guardamos la vista inicial
            this.map.getView().fit(extent, { padding: [40, 40, 40, 40], duration: 800 });

            // Evaluar si el botón de resetear vista debe mostrarse
            // Justo después de hacer fit:
            setTimeout(() => {
              const view = this.map.getView();
              const center = view.getCenter();
              this.initialCenter = (Array.isArray(center) && center.length === 2)
                ? [center[0], center[1]]
                : null;
              this.initialZoom = view.getZoom() ?? null;
              //console.log('✅ Vista inicial guardada:', this.initialCenter, this.initialZoom);
              evaluateResetVisibility(this.map, this.resetControl, this.initialCenter, this.initialZoom, this.coordsAreClose.bind(this)); // 👈 evalúa una vez después de inicializar
            }, 900); // espera que se complete el fit
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

            this.gpxPlayer = new GpxPlayer(
              this.fullCoords,
              this.markerFeature,
              (info) => { this.info = info; },
              this.updateMarkerInfoBox.bind(this),
              this.elevationChart ?? undefined
            );
          }
        });
      });
  }

  togglePlayback(): void {
    if (this.gpxPlayer) {
      this.gpxPlayer.toggle();
      this.isPlaying = this.gpxPlayer.isPlaying;
    }
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
    //const pixelRatio = window.devicePixelRatio || 1;
    const pixelRatio = 1; // Forzar a 1 para evitar problemas de escalado en algunos navegadores
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
    Altitud: <strong>${elev.toFixed(0)} m</strong><br>
    Pendiente: ${slope.toFixed(1)}%<br>
    <!-- Recorrido: ${travelled.toFixed(2)} km<br> -->
    <!-- Restante: ${remaining.toFixed(2)} km --> 
  `;
  }

  resetPlayback(): void {
    this.gpxPlayer?.reset();
  }

  setPlaybackSpeed(multiplier: number): void {
    this.gpxPlayer?.setSpeed(multiplier);
  }

  playbackSpeed = 1; // Velocidad de reproducción por defecto

  onSpeedChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const speed = parseInt(select.value, 10);
    this.playbackSpeed = speed;
    this.gpxPlayer?.setSpeed(speed);
  }

  // // Método para comparar coordenadas con una tolerancia
  private coordsAreClose(c1: [number, number] | null, c2: [number, number] | null, tolerance: number): boolean {
    if (!c1 || !c2) return false;
    return (
      Math.abs(c1[0] - c2[0]) < tolerance &&
      Math.abs(c1[1] - c2[1]) < tolerance
    );
  }
}