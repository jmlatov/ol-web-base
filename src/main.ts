import { bootstrapApplication } from '@angular/platform-browser';
import 'zone.js';
import { AppComponent } from './app/app';

bootstrapApplication(AppComponent)
  .catch(err => console.error(err));
