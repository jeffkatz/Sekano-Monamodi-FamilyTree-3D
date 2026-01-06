
import { Component, signal, viewChild, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FamilyTreeComponent } from './components/family-tree.component';
import { FAMILY_DATA } from './services/family-data';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FamilyTreeComponent],
  templateUrl: './app.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  familyData = FAMILY_DATA;
  searchTerm = signal('');
  totalMembers = signal(0);
  maxGeneration = signal(8);
  isRotating = signal(false);
  
  selectedPerson = signal<any | null>(null);
  descendants = computed(() => {
    const person = this.selectedPerson();
    if (!person) return [];
    return this.flattenDescendants(person);
  });
  
  treeComponent = viewChild<FamilyTreeComponent>('treeComponent');

  constructor() {
    this.totalMembers.set(this.calculateTotalMembers(this.familyData));
  }

  calculateTotalMembers(node: any): number {
    let count = 1;
    if (node.children) {
      node.children.forEach((child: any) => {
        count += this.calculateTotalMembers(child);
      });
    }
    return count;
  }

  flattenDescendants(node: any): any[] {
    let list: any[] = [];
    if (node.children) {
      node.children.forEach((child: any) => {
        list.push(child);
        list = [...list, ...this.flattenDescendants(child)];
      });
    }
    return list;
  }

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
  }

  updateMaxGeneration(event: Event) {
    const input = event.target as HTMLInputElement;
    this.maxGeneration.set(parseInt(input.value, 10));
  }

  toggleRotation() {
    this.isRotating.update(v => !v);
  }

  onNodeSelected(data: any) {
    this.selectedPerson.set(data);
  }

  closeDetails() {
    this.selectedPerson.set(null);
  }

  resetZoom() {
    this.treeComponent()?.resetZoom();
  }

  expandAll() {
    this.treeComponent()?.expandAll();
  }

  collapseAll() {
    this.treeComponent()?.collapseAll();
  }
}
