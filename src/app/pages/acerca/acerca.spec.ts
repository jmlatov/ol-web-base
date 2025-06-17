import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Acerca } from './acerca';

describe('Acerca', () => {
  let component: Acerca;
  let fixture: ComponentFixture<Acerca>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Acerca]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Acerca);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
