import { Component } from '@angular/core';
import { Menu } from '../menu/menu';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [Menu], // importa aquí el menú
  templateUrl: './header.html',
  styleUrls: ['./header.css']
})
export class HeaderComponent {}
