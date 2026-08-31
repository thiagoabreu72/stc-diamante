import { NgModule } from '@angular/core';
import { AppComponent } from './app.component';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SpinnerComponent } from './spinner/spinner.component';
import { MensagemComponent } from './mensagem/mensagem.component';
import { WizardStepperComponent } from './wizard-stepper/wizard-stepper.component';
import { ModalidadeComponent } from './modalidade/modalidade.component';
import { SolicitacaoComponent } from './solicitacao/solicitacao.component';
import { ConsultaLoteComponent } from './consulta-lote/consulta-lote.component';
import { AprovacaoComponent } from './aprovacao/aprovacao.component';
import { OrigemComponent } from './origem/origem.component';
import { DestinoComponent } from './destino/destino.component';
import { ResumoComponent } from './resumo/resumo.component';
import { OrigemDestinoManualComponent } from './origem-destino-manual/origem-destino-manual.component';
import { PageHeaderComponent } from './page-header/page-header.component';
import { DevolucaoBannerComponent } from './devolucao-banner/devolucao-banner.component';
import { ImpressaoComponent } from './impressao/impressao.component';
import { MoedaPipe } from './pipes/moeda.pipe';

// PRIMENG
import { CardModule } from 'primeng/card';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { StepsModule } from 'primeng/steps';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';
import { MessagesModule } from 'primeng/messages';
import { ToastModule } from 'primeng/toast';
import { CalendarModule } from 'primeng/calendar';
import { RadioButtonModule } from 'primeng/radiobutton';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';

@NgModule({
  declarations: [
    AppComponent,
    SpinnerComponent,
    MensagemComponent,
    WizardStepperComponent,
    ModalidadeComponent,
    SolicitacaoComponent,
    ConsultaLoteComponent,
    AprovacaoComponent,
    OrigemComponent,
    DestinoComponent,
    ResumoComponent,
    OrigemDestinoManualComponent,
    PageHeaderComponent,
    DevolucaoBannerComponent,
    ImpressaoComponent,
    MoedaPipe,
  ],
  imports: [
    BrowserAnimationsModule,
    BrowserModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    // Sem rotas reais (a navegação entre etapas é feita pelo hash do BPM, não pelo Angular
    // Router) — registrado vazio só porque o p-steps do PrimeNG injeta ActivatedRoute.
    RouterModule.forRoot([]),
    CardModule,
    DropdownModule,
    InputTextModule,
    InputTextareaModule,
    InputNumberModule,
    ButtonModule,
    TagModule,
    StepsModule,
    TableModule,
    MessageModule,
    MessagesModule,
    ToastModule,
    CalendarModule,
    RadioButtonModule,
    CheckboxModule,
    DialogModule,
  ],

  providers: [MessageService],
  bootstrap: [AppComponent],
})
export class AppModule {}
