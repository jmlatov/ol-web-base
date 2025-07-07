// reset-view-control.ts
import { Control } from 'ol/control';
import { Map as OlMap } from 'ol';

// Clase para el botón de resetear vista
export class ResetViewControl extends Control {
    private button: HTMLButtonElement;
    public elementDiv: HTMLDivElement;

    constructor(callback: () => void) {
        const button = document.createElement('button');
        button.innerHTML = '🔄';
        button.title = 'Resetear vista';
        button.style.display = 'none';

        const element = document.createElement('div');
        element.className = 'ol-unselectable ol-control reset-view-control hidden';
        element.appendChild(button);

        super({ element });
        this.button = button;
        this.elementDiv = element;

        button.addEventListener('click', callback);
    }

    show() {
        //console.log('🟢 mostrando botón');
        this.button.style.display = 'block';
    }

    hide() {
        //console.log('🔴 ocultando botón');
        this.button.style.display = 'none';
    }
}

// Método para evaluar si el botón de resetear vista debe mostrarse
// Este método se llama cada vez que cambia el centro o la resolución del mapa
// Puedes ajustar la tolerancia según tus necesidades
// Aquí se compara el extent actual del mapa con el extent inicial
// Si son diferentes, se muestra el botón; si son iguales, se oculta
// Esto permite que el botón de resetear vista aparezca solo cuando el usuario ha movido o hecho zoom en el mapa
// Puedes ajustar la tolerancia según tus necesidades
// Corregido para no depender del Extent, sino del centro y zoom
export function evaluateResetVisibility(
    map: OlMap,
    resetControl: ResetViewControl,
    initialCenter: [number, number] | null,
    initialZoom: number | null,
    coordsAreClose: (
        c1: [number, number] | null,
        c2: [number, number] | null,
        tolerance: number
    ) => boolean
) {
    const view = map.getView();
    const currentCenter = view.getCenter();
    const currentZoom = view.getZoom();

    if (!initialCenter || !initialZoom || !currentCenter || currentZoom === undefined) return;

    const centerChanged = !coordsAreClose(
        Array.isArray(currentCenter) && currentCenter.length === 2 ? [currentCenter[0], currentCenter[1]] : null,
        initialCenter,
        10
    );
    const zoomChanged = Math.abs(currentZoom - initialZoom) > 0.05;

    const hasChanged = centerChanged || zoomChanged;

   // console.log(`📐 Cambios detectados — center: ${centerChanged}, zoom: ${zoomChanged}`);

    if (hasChanged) {
        resetControl.show();
    } else {
        resetControl.hide();
    }
}
