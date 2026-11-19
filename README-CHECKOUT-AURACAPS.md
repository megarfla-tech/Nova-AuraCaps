# AuraCaps — atualização de checkout e pedidos

## Implementado no frontend
- Ofertas ativas em trilho horizontal com gesto de arrastar/deslizar no celular e setas no desktop.
- Carrinho persistido no navegador para não desaparecer ao navegar para o login.
- Checkout exige login e permite entrega ou retirada na loja.
- Entrega exige subtotal final mínimo de R$ 20,00; retirada não tem frete.
- Pagamento presencial: Pix, dinheiro ou cartão de crédito/débito. O site não inicia cobrança online.
- Entrega pode usar endereço salvo ou cadastrar novo endereço no checkout.
- Conta do cliente mostra o andamento do pedido e permite atualizar o status manualmente.

## Alteração aplicada no Supabase existente
Foi aplicada uma migration não destrutiva no projeto atual:
- adicionada `public.orders.fulfillment_type`;
- criada a função transacional `public.create_customer_order(text,text,uuid,text,jsonb)`;
- execução da função liberada somente para `authenticated`;
- a função valida o usuário e o cadastro de cliente, valida endereço de entrega, confere produto/estoque e recalcula preços/descontos no banco;
- grava cabeçalho e itens do pedido na mesma transação.

Nenhuma tabela foi recriada. Nenhum pagamento PagBank é iniciado por esse checkout.

## Status usados no acompanhamento
Atualize `public.orders.status` conforme o andamento:
- `received` — Pedido recebido
- `packed` — Empacotado
- `out_for_delivery` — Saiu para entrega
- `ready_for_pickup` — Pronto para retirada
- `completed` — Concluído
- `cancelled` — Cancelado

O cliente vê o andamento ao entrar em Minha conta e pode tocar em “Atualizar status”.

## Configuração ainda necessária no painel
2. Em Supabase → Authentication → URL Configuration, adicione a URL pública do site terminando em `/auth/callback.html` às Redirect URLs.

## Taxa de entrega
O projeto aplica o mínimo de R$ 20,00 para entrega e retirada gratuita. Como não foi informada uma taxa de entrega, o checkout avisa que eventual taxa será confirmada pela loja antes do envio e não inventa um valor.

## Banners da página inicial

- A Home consulta a view pública `public.api_banners` e posiciona `position = 1` antes de Ofertas ativas e `position = 2` depois de Ofertas ativas.
- O gerenciamento fica em `#/admin/banners` e também aparece na conta de usuários com perfil `SUPER_ADMIN` ativo.
- O formulário cadastra, edita, ativa/desativa, programa início/fim, define link e envia imagens desktop/mobile ao bucket público `banners`.
- O acesso administrativo usa as políticas RLS existentes da tabela `public.banners`. Foram adicionadas políticas de Storage para permitir upload e exclusão de arquivos somente a usuários `SUPER_ADMIN` ativos.
- Não foi criada nem recriada nenhuma tabela. Já havia um banner cadastrado na posição 1; a posição 2 pode ser preenchida pelo painel.

## Banners da página inicial — posições confirmadas (08/11/2026)

- Posição 1: `Banner_home_1.jpg` — exibido antes da seção “Ofertas ativas”.
- Posição 2: `Banner_home_2.jpg` — exibido imediatamente depois da seção “Ofertas ativas”.
- A Home lê os dois registros pela view `api_banners`; os slots possuem os IDs `home-banner-before-offers` e `home-banner-after-offers` para facilitar validação.
- Os dois registros e as imagens correspondentes estão no Supabase Storage / tabela `banners`; nenhuma tabela foi criada.

## Compartilhamento de produtos pelo WhatsApp

- Na página individual de cada produto foi adicionado o botão “Compartilhar no WhatsApp”.
- Ao tocar, abre o WhatsApp (ou WhatsApp Web, conforme o dispositivo) com o nome do produto e o link atual já preenchidos.
- O compartilhamento depende de o site estar publicado em um endereço acessível; links locais/preview podem não abrir corretamente para outras pessoas.
