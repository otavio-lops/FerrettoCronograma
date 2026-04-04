# 📅 Ferretto — Cronograma Personalizado

Uma extensão de código aberto desenvolvida para transformar a experiência de organização de estudos na plataforma Ferretto. Criada por um estudante, para estudantes.

## 🎯 Por que usar esta extensão?
A ferramenta nativa de cronograma da plataforma possui limitações que podem dificultar um planejamento realista. Esta extensão foi desenvolvida para oferecer a **flexibilidade** que nós, estudantes, precisamos, permitindo um controle mais preciso sobre a rotina de estudos.

## ✨ Principais Diferenciais e Funcionalidades

* **Controle de Matérias (Exclusivo):** Diferente da ferramenta nativa, aqui você define a quantidade de matérias por dia, permitindo um equilíbrio melhor entre disciplinas densas e leves.
* **Organizador de Atrasados (Exclusivo):** Diferente da ferramenta nativa, aqui você tem um sistema inteligente que adapta em tempo real o seu cronograma distribuindo conteúdo atrasado na semana atual de forma leve e dinâmica, sem quebrar o seu cronograma.
* **Planejamento Flexível:** Defina exatamente quais dias da semana você quer estudar e a carga horária diária desejada.
* **Edição Dinâmica:** Permite ajustes no cronograma mesmo após a criação inicial, adaptando-se a imprevistos da vida real.
* **Acesso Rápido:** Com a nova atualização, você pode acessar o cronograma em qualquer página, e mover ela para onde você quiser na sua tela, permitindo que você tenha melhor controle sobre a organização visual.
* **Zero requisições externas:** Nenhum dado é enviado para servidores. Toda a lógica roda localmente no navegador.
* **Funcionamento passivo:** A extensão não interfere no funcionamento da plataforma, ela apenas reorganiza os dados que já são exibidos da sua turma!

## 📸 Demonstração da Interface

| Configuração Inicial (1) | Configuração Inicial (2) | Cronograma de Estudos | 
| :---: | :---: | :---: |
| <img src="https://raw.githubusercontent.com/otavio-lops/FerrettoCronograma/refs/heads/main/images/preview1.png" width="300"> | <img src="https://raw.githubusercontent.com/otavio-lops/FerrettoCronograma/refs/heads/main/images/preview2.png" width="300"> | <img src="https://raw.githubusercontent.com/otavio-lops/FerrettoCronograma/refs/heads/main/images/preview3.png" width="300">

## 🛡️ Segurança e Transparência
Esta é uma extensão **passiva** e focada em privacidade.

**Auditoria Rápida:** Como o projeto é aberto, você consegue **copiar o link desta página e colar em qualquer chatbot** e solicitar para ele analisar a segurança do código para você! :)
  > **Exemplo de prompt:** Analise o repositório "https://github.com/otavio-lops/FerrettoCronograma/" de forma rígida, procure por vulnerabilidades no código-fonte e possíveis ameaças a minha segurança. No final, de um parecer se o projeto é seguro ou não.

### Detalhes da Segurança
* **Sem Acesso Indevido:** A extensão NÃO fornece acesso gratuito ao conteúdo pago. Ela apenas reorganiza os dados que o usuário já possui direito de acessar após o login.
* **Zero Requisições (Passive Mode):** A ferramenta não faz chamadas de rede (API/Fetch) para os servidores da plataforma. Ela atua estritamente no *client-side*, lendo e formatando os dados já carregados no seu navegador.
* **Conformidade:** Não há quebra de termos de serviço (ToS) para fins de exploração de dados, pois a extensão atua apenas como uma camada visual personalizada.<br>

## 💡 Filosofia do Projeto
Este projeto **não possui fins lucrativos ou financeiros**. Ele nasceu da necessidade individual de um estudante e está sendo compartilhado gratuitamente para ajudar a comunidade a ter uma preparação mais organizada e menos estressante.<br>
> **Nota sobre atualizações:** Como também sou vestibulando, talvez eu não consiga me dedicar o tempo todo para trazer novas melhorias/atualizações. No entanto, a versão atual já funciona perfeitamente para o propósito inicial, inclusive, eu a utilizo diariamente na minha própria rotina de estudos! ;)

## 🛠️ Como Instalar (Manual)
> Para usuários de Firefox/Forks: Siga o passo a passo de instalação no Release ``Firefox: Instalar Cronograma``, ou clique [aqui](https://github.com/otavio-lops/FerrettoCronograma/releases/tag/v1.5.0).
1. Faça o download do código deste repositório.
2. No seu navegador (Chrome/Edge/Brave/Outros...), acesse `chrome://extensions/`.
3. Ative o **Modo do Desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta onde você salvou os arquivos.

---

## ❓ FAQ - Perguntas Frequentes

**1. É seguro utilizar esta extensão?**
Sim. A extensão é de código aberto, o que significa que qualquer pessoa pode auditar o código (inclusive você!). Ela funciona de forma passiva, apenas reorganizando visualmente os dados que a plataforma já envia para o seu navegador.

**2. Meus dados de login ou senha são coletados?**
**Não.** A extensão não possui campos de login e não tem acesso às suas credenciais. Ela só funciona quando você já está autenticado na plataforma oficial.

**3. Posso ser banido por usar a extensão?**
Tecnicamente, a extensão atua apenas no seu computador e não quebra nenhuma regra da plataforma, vide que ela funciona de maneira passiva. Para a plataforma, você é um usuário comum navegando. No entanto, o uso é por sua conta e risco.

**4. A extensão libera conteúdo pago para quem não é assinante?**
**Não.** Esta ferramenta não é um "crack". Se você não tem acesso a uma matéria na sua conta oficial, a extensão não terá dados para reorganizar para você.

**5. Por que usar esta extensão em vez da nativa?**
Pela personalização. Você pode definir matérias por dia (e não apenas horas), escolher dias específicos da semana e gerenciar atrasos de forma muito mais intuitiva.

**6. A extensão funciona no celular (Android/iOS)?**
Depende. Ela foi projetada para navegadores desktop baseados no Firefox ou Chromium, porém, alguns navegadores de celular permitem a adição de extensões, verifique diretamente no seu navegador.

**7. O que acontece se a plataforma Ferretto atualizar o site?**
Mudanças drásticas no código da plataforma podem fazer a extensão parar de funcionar temporariamente até que o código aqui no GitHub seja atualizado, já que a extensão depende exclusivamente da leitura do tempo de aula e matérias que a plataforma envia.

**8. Posso editar meu cronograma depois de criado?**
Sim! Diferente da ferramenta oficial, esta extensão permite ajustes dinâmicos conforme sua rotina muda.

**9. A extensão é gratuita?**
Sim, 100% gratuita e de código aberto.

---

## ⚖️ Aviso Legal
Esta extensão é uma ferramenta de produtividade de código aberto e independente. Ela não possui vínculo, patrocínio ou autorização da plataforma Ferretto. O uso desta ferramenta é de inteira responsabilidade do usuário. O desenvolvedor não se responsabiliza por eventuais atualizações na plataforma que tornem a extensão incompatível ou por decisões administrativas da plataforma em relação ao uso de extensões de terceiros.

<img src="https://komarev.com/ghpvc/?username=otavio-lops-FerretoCronograma&label=VISITANTES&color=bd93f9&style=for-the-badge"/>
