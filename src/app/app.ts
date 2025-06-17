import { Component } from '@angular/core';
import { HeaderComponent } from './components/header/header';
import { Body } from './components/body/body';
import { Footer } from './components/footer/footer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [HeaderComponent, Body, Footer],
  template: `
    <app-header></app-header>


   <!-- <main style="padding: 20px;">
      <p>Contenido del cuerpo de la aplicación</p>
      <body>Esto es el cuerpo del la página Web</body>
    </main> -->

    
    <app-body></app-body>
    <app-footer></app-footer>
  `
})
export class AppComponent {}
