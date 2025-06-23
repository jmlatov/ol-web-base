import { Chart } from 'chart.js/auto';
import { getDistance } from 'ol/sphere';
import { toLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';

export function drawElevationChart(
  canvas: HTMLCanvasElement,
  coords: [number, number, number][],
  resizeCanvas: (canvas: HTMLCanvasElement, heightPx: number) => void,
  markerFeature: Feature<Point>,
  chartRef: { current: Chart | null }
): void {
  const labels: string[] = [];
  const elevations: number[] = [];
  const distances: number[] = [0];
  const slopes: number[] = [0];

  let totalDist = 0;

  for (let i = 1; i < coords.length; i++) {
    const lonLat1 = toLonLat([coords[i - 1][0], coords[i - 1][1]]);
    const lonLat2 = toLonLat([coords[i][0], coords[i][1]]);
    const segmentDist = getDistance(lonLat1, lonLat2);
    totalDist += segmentDist;
    distances.push(totalDist);
  }

  for (let i = 0; i < coords.length; i++) {
    elevations.push(coords[i][2]);
    labels.push((distances[i] / 1000).toFixed(2));

    if (i > 0) {
      const dz = coords[i][2] - coords[i - 1][2];
      const dx = distances[i] - distances[i - 1];
      const slope = dx > 0 ? (dz / dx) * 100 : 0;
      slopes.push(Number(slope.toFixed(2)));
    }
  }

  resizeCanvas(canvas, 200);

  if (chartRef.current) {
    chartRef.current.destroy();
  }

  chartRef.current = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Elevación (m)',
        data: elevations,
        borderColor: '#4A90E2',
        backgroundColor: 'rgba(74, 144, 226, 0.1)',
        fill: true,
        pointRadius: 0,
        tension: 0.2,
        yAxisID: 'y',
      }]
    },
    options: {
      responsive: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const idx = context.dataIndex;
              const elev = context.parsed.y;
              const slope = slopes[idx] ?? 0;
              return `Elevación: ${elev.toFixed(1)} m, Pendiente: ${slope.toFixed(1)}%`;
            }
          }
        }
      },
      onHover: (event, elements) => {
        const index = elements[0]?.index;
        if (index !== undefined && coords[index]) {
          const [x, y] = [coords[index][0], coords[index][1]];
          markerFeature?.getGeometry()?.setCoordinates([x, y]);
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Distancia (km)',
          },
        },
        y: {
          title: {
            display: true,
            text: 'Elevación (m)',
          },
        }
      }
    }
  });
}
