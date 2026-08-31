import { Pipe, PipeTransform } from '@angular/core';

// toLocaleString('pt-BR') não depende de registrar locale data do Angular
// (registerLocaleData) — o motor JS do navegador já suporta o formato
// brasileiro nativamente. Só formata o número (1.234,56); o "R$" continua
// sendo escrito à parte nos templates, igual já era feito com toFixed(2).
@Pipe({ name: 'moeda' })
export class MoedaPipe implements PipeTransform {
  transform(valor: number | string | null | undefined): string {
    const numero = Number(valor) || 0;
    return numero.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
