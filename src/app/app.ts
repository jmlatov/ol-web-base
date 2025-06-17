import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from './components/header/header';
import { Body } from './components/body/body';
import { Footer } from './components/footer/footer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [HeaderComponent, Body, Footer, RouterModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css' ]
})
export class AppComponent {}
