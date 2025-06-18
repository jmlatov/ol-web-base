import { bootstrapApplication } from '@angular/platform-browser';
import 'zone.js';
import { AppComponent } from './app/app';
import { Body } from './app/components/body/body';
import { Acerca } from './app/pages/acerca/acerca';
import { Contacto } from './app/pages/contacto/contacto';
import { provideRouter, Routes } from '@angular/router';
import { GpxMap } from './app/pages/gpx-map/gpx-map';

const routes: Routes = [
  { path: '', component: Body },
  { path: 'acerca', component: Acerca },
  { path: 'contacto', component: Contacto },
  { path: 'gpx-map', component: GpxMap },
];

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes)]
}).catch(err => console.error(err));