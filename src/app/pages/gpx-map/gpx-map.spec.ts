import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GpxMap } from './gpx-map';

describe('GpxMap', () => {
  let component: GpxMap;
  let fixture: ComponentFixture<GpxMap>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GpxMap]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GpxMap);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
