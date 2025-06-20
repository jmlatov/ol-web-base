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

  private map!: OlMap;
  private source = new VectorSource();
  private waypointData: Map<string, { name: string; desc?: string; image?: string; info?: string }> = new Map();

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

  @ViewChild('legendRef') legendRef!: ElementRef<HTMLDivElement>;
legendExpanded = true;

toggleLegend(): void {
  this.legendExpanded = !this.legendExpanded;
}


  ngAfterViewInit(): void {
    const popupContainer = document.getElementById('popup')!;
    const popupContent = document.getElementById('popup-content')!;
    const popupCloser = document.getElementById('popup-closer')!;

    const legendControl = new Control({ element: this.legendRef.nativeElement });

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

    this.map.addControl(legendControl);


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


}

