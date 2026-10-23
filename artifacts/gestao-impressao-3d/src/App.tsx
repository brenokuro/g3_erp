import { type FormEvent, type InputHTMLAttributes, type ReactNode, useEffect, useMemo, useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { upload } from '@vercel/blob/client';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter, useParams } from 'wouter';
import { useAuth } from '@workspace/auth-web';
import {
  getGetDashboardQueryKey, getGetOrderQueryKey, getListClientsQueryKey, getListOrdersQueryKey,
  getListOrderAttachmentsQueryKey, getListOrderEventsQueryKey, getGetClientQueryKey,
  useGetDashboard, useListClients, useCreateClient, useUpdateClient, useDeleteClient,
  useListOrders, useCreateOrder, useGetOrder, useGetClient, useUpdateOrder, useDeleteOrder,
  useListOrderEvents, useListOrderAttachments, useCreateOrderAttachment, useDeleteOrderAttachment,
} from '@workspace/api-client-react';
import type { Attachment, Client, Order, OrderStatus } from '@workspace/api-client-react';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, Bell, Box, BriefcaseBusiness, CalendarDays,
  Check, ChevronDown, CircleAlert, ClipboardList, Clock3, FileText, Filter, Layers3,
  LogIn, LogOut, Menu, PackageCheck, Plus, Search, Settings2, Upload, Users,
  Wallet, X, Trash2, Pencil, ExternalLink,
} from 'lucide-react';

const queryClient = new QueryClient();
const STATUSES: OrderStatus[] = ['orcamento','aguardando_aprovacao','em_impressao','pos_processamento','pronto','entregue','cancelado'];
const STATUS_LABEL: Record<OrderStatus,string> = { orcamento:'Orçamento', aguardando_aprovacao:'Aguardando aprovação', em_impressao:'Em impressão', pos_processamento:'Pós-processamento', pronto:'Pronto', entregue:'Entregue', cancelado:'Cancelado' };
const STATUS_TONE: Record<OrderStatus,string> = { orcamento:'status-neutral', aguardando_aprovacao:'status-amber', em_impressao:'status-blue', pos_processamento:'status-violet', pronto:'status-green', entregue:'status-done', cancelado:'status-red' };
const brl = (value:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const dateBR = (value?:string|null) => value ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)) : 'Sem prazo';
const dateTimeBR = (value:string) => new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const initials = (name:string) => name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();

function LoginForm() {
  const {login,isLoggingIn,error,clearError}=useAuth();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [urlError,setUrlError]=useState<string|null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) {
      setUrlError(err);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    setUrlError(null);
    try{await login(email,password);}catch{/* erro exibido pelo hook */}
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  const displayError = error || urlError;

  return <form className="auth-login-form" onSubmit={submit}>
    <button
      type="button"
      className="btn-google"
      onClick={handleGoogleLogin}
      data-testid="button-login-google"
    >
      <FcGoogle size={20}/>
      <span>Entrar com o Google</span>
    </button>

    <div className="auth-divider">
      <span>ou com e-mail e senha</span>
    </div>

    <label><span>E-mail</span><input className="text-input" type="email" autoComplete="email" required value={email} onChange={e=>{clearError();setUrlError(null);setEmail(e.target.value);}} placeholder="voce@oficina.com" data-testid="input-login-email"/></label>
    <label><span>Senha</span><input className="text-input" type="password" autoComplete="current-password" required value={password} onChange={e=>{clearError();setUrlError(null);setPassword(e.target.value);}} placeholder="Sua senha" data-testid="input-login-password"/></label>
    {displayError&&<p className="form-error" role="alert">{displayError}</p>}
    <button className="btn btn-primary" type="submit" disabled={isLoggingIn} data-testid="button-sign-in"><LogIn size={17}/>{isLoggingIn?'Entrando…':'Entrar na conta'}</button>
  </form>;
}

function Shell({children}:{children:ReactNode}) {
  const [path] = useLocation();
  const [mobileNav,setMobileNav] = useState(false);
  const {user,isLoading,isAuthenticated,logout} = useAuth();
  const nav = [{href:'/',label:'Visão geral',icon:Layers3},{href:'/clientes',label:'Clientes',icon:Users},{href:'/pedidos',label:'Pedidos',icon:ClipboardList}];
  return <div className="app-shell flex bg-background text-foreground">
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}>
      <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><Box size={19}/></span><span>gestão<span className="brand-light">3D</span><small>OFICINA DIGITAL</small></span></Link>
      <div className="side-caption">ESPAÇO DE TRABALHO</div>
      <nav className="nav-list" aria-label="Navegação principal">
        {nav.map(item=>{const Icon=item.icon; const active=item.href==='/'?path==='/':path.startsWith(item.href);return <Link key={item.href} href={item.href} onClick={()=>setMobileNav(false)} data-testid={`nav-${item.label.toLowerCase().replaceAll(' ','-')}`} className={`sidebar-link ${active?'nav-active':''}`}><Icon size={18}/><span>{item.label}</span>{item.href==='/pedidos'&&<span className="nav-dot"/>}</Link>})}
      </nav>
      <div className="side-bottom">
        <div className="side-note"><div className="side-note-icon"><Activity size={16}/></div><div><strong>Seu ritmo, em dia.</strong><span>Um passo de cada vez.</span></div></div>
        <button className="user-row" onClick={isAuthenticated?logout:undefined} disabled={isLoading} data-testid="button-auth">
          <span className="user-avatar">{isLoading?'…':isAuthenticated?initials(user?.firstName||user?.email||'U'):<LogIn size={16}/>}</span>
          <span className="user-copy"><strong>{isLoading?'Verificando sessão':isAuthenticated?(user?.firstName||'Sua conta'):'Entrar na conta'}</strong><small>{isAuthenticated?(user?.email||'Sessão ativa'):'Acesso seguro'}</small></span>
          {isAuthenticated?<LogOut size={15}/>:<ArrowRight size={15}/>}
        </button>
      </div>
    </aside>
    {mobileNav&&<button className="mobile-scrim" onClick={()=>setMobileNav(false)} aria-label="Fechar navegação" data-testid="button-close-navigation"/>}
    <main className="main-area min-w-0 flex-1">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={()=>setMobileNav(true)} aria-label="Abrir menu" data-testid="button-open-navigation"><Menu size={19}/></button>
        <div className="crumb"><span>Gestão 3D</span><span className="crumb-slash">/</span><strong>{path==='/'?'Visão geral':path.startsWith('/clientes')?'Clientes':'Pedidos'}</strong></div>
        <div className="top-actions"><span className="today-label"><CalendarDays size={15}/>{new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'2-digit',month:'long'}).format(new Date())}</span><span className="top-divider"/><span className="icon-button" aria-label="Sem novas notificações" title="Sem novas notificações" data-testid="status-notifications"><Bell size={17}/></span><span className="top-avatar">{isAuthenticated?initials(user?.firstName||user?.email||'U'):'G3'}</span></div>
      </header>
      <section className="content-area page-enter">{isLoading?<div className="state-card auth-state"><span className="state-icon"><Box size={21}/></span><strong>Verificando acesso</strong><p>Estamos preparando sua oficina.</p></div>:isAuthenticated?children:<div className="auth-gate"><span className="auth-gate-mark"><Box size={22}/></span><div className="eyebrow">ACESSO À SUA OFICINA</div><h1>Entre para organizar seus projetos</h1><p>Faça login para acessar seus clientes, pedidos e documentos com segurança.</p><LoginForm/></div>}</section>
    </main>
  </div>;
}

function PageHeading({eyebrow,title,description,action}:{eyebrow:string,title:string,description:string,action?:ReactNode}) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action&&<div className="heading-action">{action}</div>}</div>;
}
function Button({children,onClick,variant='primary',testId,disabled,type='button'}:{children:ReactNode,onClick?:()=>void,variant?:'primary'|'secondary'|'quiet'|'danger',testId:string,disabled?:boolean,type?:'button'|'submit'}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`btn btn-${variant}`} data-testid={testId}>{children}</button>;
}
function StatusPill({status}:{status:OrderStatus}) { return <span className={`status-pill ${STATUS_TONE[status]}`} data-testid={`status-${status}`}>{STATUS_LABEL[status]}</span>; }
function LoadingRows({count=4}:{count?:number}) {return <div className="skeleton-list" aria-label="Carregando"><span className="sr-only">Carregando dados</span>{Array.from({length:count},(_,i)=><div className="skeleton-row" key={i}><i/><span/><span/></div>)}</div>}
function QueryError({retry}:{retry:()=>void}) {return <div className="state-card"><span className="state-icon error"><CircleAlert size={21}/></span><strong>Não foi possível carregar</strong><p>Confira sua conexão e tente novamente.</p><Button variant="secondary" onClick={retry} testId="button-retry">Tentar novamente</Button></div>}
function EmptyState({title,body,action}:{title:string,body:string,action?:ReactNode}) {return <div className="state-card"><span className="state-icon"><Box size={21}/></span><strong>{title}</strong><p>{body}</p>{action}</div>}
function Modal({title,description,onClose,children}:{title:string,description?:string,onClose:()=>void,children:ReactNode}) {return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><h2 id="modal-title">{title}</h2>{description&&<p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Fechar" data-testid="button-close-dialog"><X size={18}/></button></div>{children}</section></div>}
function Field({label,children,wide=false}:{label:string,children:ReactNode,wide?:boolean}) {return <label className={`field ${wide?'field-wide':''}`}><span>{label}</span>{children}</label>}
type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { 'data-testid'?: string };
function TextInput(props:TextInputProps) {return <input {...props} className={`text-input ${props.className||''}`}/>;}
function Toast({message,onClose}:{message:string,onClose:()=>void}) {return message?<div className="toast" role="status" data-testid="toast-message"><Check size={16}/><span>{message}</span><button onClick={onClose} aria-label="Fechar aviso"><X size={15}/></button></div>:null;}

function DashboardPage() {
  const q=useGetDashboard(); const data=q.data;
  return <div>
    <PageHeading eyebrow="PAINEL DA OFICINA" title="Bom dia. Vamos produzir?" description="Um panorama simples do que merece sua atenção hoje." action={<Link href="/pedidos" className="btn btn-primary" data-testid="link-new-order"><Plus size={17}/>Novo pedido</Link>}/>
    {q.isLoading?<div className="stats-grid">{[1,2,3,4].map(i=><div className="stat-card skeleton-stat" key={i}><i/><i/><i/></div>)}</div>:q.isError?<QueryError retry={()=>q.refetch()}/>:<>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-top"><span>Clientes</span><span className="stat-icon blue"><Users size={17}/></span></div><strong data-testid="metric-clients">{data?.clientsCount??0}</strong><small>na sua carteira</small></div>
        <div className="stat-card"><div className="stat-top"><span>Pedidos em aberto</span><span className="stat-icon ink"><ClipboardList size={17}/></span></div><strong data-testid="metric-open-orders">{data?.openOrders??0}</strong><small>em andamento</small></div>
        <div className="stat-card"><div className="stat-top"><span>Receita do mês</span><span className="stat-icon mint"><Wallet size={17}/></span></div><strong data-testid="metric-revenue">{brl(data?.monthRevenue??0)}</strong><small>pedidos entregues</small></div>
        <div className="stat-card"><div className="stat-top"><span>Valor pendente</span><span className="stat-icon pale"><Clock3 size={17}/></span></div><strong data-testid="metric-pending">{brl(data?.pendingValue??0)}</strong><small>aguardando conclusão</small></div>
      </div>
      <div className="dashboard-grid">
        <section className="panel recent-panel"><div className="panel-head"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Pedidos recentes</h2></div><Link href="/pedidos" className="text-link" data-testid="link-all-orders">Ver todos <ArrowRight size={15}/></Link></div>
          {(data?.recentOrders?.length??0)===0?<EmptyState title="Sua produção começa aqui" body="Crie o primeiro pedido para acompanhar projetos e prazos." action={<Link href="/pedidos" className="btn btn-primary" data-testid="link-create-first-order"><Plus size={16}/>Criar pedido</Link>}/>:<div className="order-list">{data?.recentOrders.map(o=><Link key={o.id} href={`/pedidos/${o.id}`} className="order-row" data-testid={`row-recent-order-${o.id}`}><span className="order-symbol"><Box size={17}/></span><span className="order-main"><strong>{o.title}</strong><small>{o.orderNumber} <b>·</b> {o.clientName}</small></span><span className="order-due">{dateBR(o.dueDate)}</span><StatusPill status={o.status}/><span className="order-value">{brl(o.amount)}</span><ArrowRight className="row-arrow" size={16}/></Link>)}</div>}
        </section>
        <section className="panel stages-panel"><div className="panel-head"><div><span className="eyebrow">FLUXO DE TRABALHO</span><h2>Onde estão os projetos</h2></div><span className="tiny-mono">AGORA</span></div>
          <div className="stage-list">{STATUSES.filter(s=>s!=='entregue'&&s!=='cancelado').map((s,i)=>{const count=data?.statusCounts?.find(x=>x.status===s)?.count??0;return <div className="stage-row" key={s}><span className={`stage-number ${STATUS_TONE[s]}`}>{String(i+1).padStart(2,'0')}</span><span className="stage-name">{STATUS_LABEL[s]}</span><div className="stage-track"><i style={{width:`${Math.min(100,count*22)}%`}}/></div><strong data-testid={`stage-count-${s}`}>{count}</strong></div>})}</div>
          <div className="stage-foot"><span className="stage-live"/><span>Atualizado com seus pedidos</span></div>
        </section>
      </div>
      <div className="dashboard-foot"><div className="foot-mark"><PackageCheck size={19}/></div><div><strong>Feito para acompanhar a peça, não a papelada.</strong><span>Os dados da sua oficina em um só lugar, sempre à mão.</span></div><Link href="/clientes" className="text-link" data-testid="link-clients-from-dashboard">Ver clientes <ArrowRight size={15}/></Link></div>
    </>}
  </div>;
}

type ClientDraft={name:string,companyName:string,email:string,phone:string,document:string,address:string,notes:string};
const emptyClient:ClientDraft={name:'',companyName:'',email:'',phone:'',document:'',address:'',notes:''};
function ClientDialog({client,onClose,onSaved}:{client?:Client|null,onClose:()=>void,onSaved:(message:string)=>void}) {
  const [form,setForm]=useState<ClientDraft>(client?{name:client.name,companyName:client.companyName||'',email:client.email||'',phone:client.phone||'',document:client.document||'',address:client.address||'',notes:client.notes||''}:emptyClient);
  const qc=useQueryClient(); const create=useCreateClient();const update=useUpdateClient();
  const pending=create.isPending||update.isPending;
   const submit=(e:FormEvent)=>{e.preventDefault();const payload={...form,companyName:form.companyName||null,email:form.email||null,phone:form.phone||null,document:form.document||null,address:form.address||null,notes:form.notes||null};const done=()=>{qc.invalidateQueries({queryKey:getListClientsQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});onSaved(client?'Cliente atualizado.':'Cliente criado.');onClose();};if(client)update.mutate({id:client.id,data:payload},{onSuccess:done});else create.mutate({data:payload},{onSuccess:done});};
  return <Modal title={client?'Editar cliente':'Novo cliente'} description="Mantenha os dados de contato sempre por perto." onClose={onClose}><form className="form-grid" onSubmit={submit}>
    <Field label="Nome completo *"><TextInput required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nome do cliente" data-testid="input-client-name"/></Field>
    <Field label="Empresa"><TextInput value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})} placeholder="Nome da empresa" data-testid="input-client-company"/></Field>
    <Field label="E-mail"><TextInput type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="nome@email.com" data-testid="input-client-email"/></Field>
    <Field label="Telefone"><TextInput value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="(00) 00000-0000" data-testid="input-client-phone"/></Field>
    <Field label="CPF / CNPJ"><TextInput value={form.document} onChange={e=>setForm({...form,document:e.target.value})} placeholder="000.000.000-00" data-testid="input-client-document"/></Field>
    <Field label="Endereço"><TextInput value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Rua, número, cidade" data-testid="input-client-address"/></Field>
    <Field label="Observações" wide><textarea className="text-input textarea" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Detalhes importantes sobre este relacionamento" data-testid="input-client-notes"/></Field>
    <div className="modal-actions"><Button variant="secondary" onClick={onClose} testId="button-cancel-client">Cancelar</Button><Button type="submit" disabled={pending} testId="button-save-client">{pending?'Salvando…':client?'Salvar alterações':'Cadastrar cliente'}</Button></div>
    {create.isError||update.isError?<p className="form-error">Não foi possível salvar. Verifique os dados e tente novamente.</p>:null}
  </form></Modal>;
}

function ClientsPage() {
  const [search,setSearch]=useState('');const [dialog,setDialog]=useState(false);const [editing,setEditing]=useState<Client|null>(null);const [toast,setToast]=useState('');
  const q=useListClients(search?{search}:undefined);const qc=useQueryClient();const del=useDeleteClient();
  const clients=q.data??[];
  const remove=(c:Client)=>{if(window.confirm(`Excluir o cadastro de ${c.name}? Esta ação não pode ser desfeita.`))del.mutate({id:c.id},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListClientsQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});setToast('Cliente removido.');},onError:()=>setToast('Não foi possível excluir. Este cliente pode estar vinculado a pedidos.')});};
  return <><PageHeading eyebrow="RELACIONAMENTOS" title="Clientes" description="Os contatos e detalhes de quem confia seu projeto à oficina." action={<Button onClick={()=>setDialog(true)} testId="button-new-client"><Plus size={17}/>Novo cliente</Button>}/>
    <section className="panel table-panel"><div className="list-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, empresa ou e-mail" aria-label="Buscar clientes" data-testid="input-search-clients"/>{search&&<button onClick={()=>setSearch('')} aria-label="Limpar busca" data-testid="button-clear-client-search"><X size={15}/></button>}</div><span className="result-count">{q.isLoading?'':`${clients.length} ${clients.length===1?'cliente':'clientes'}`}</span></div>
      {q.isLoading?<LoadingRows/>:q.isError?<QueryError retry={()=>q.refetch()}/>:clients.length===0?<EmptyState title={search?'Nenhum cliente encontrado':'Ainda não há clientes'} body={search?'Experimente outro nome ou e-mail.':'Cadastre seu primeiro cliente para organizar os projetos.'} action={!search&&<Button onClick={()=>setDialog(true)} testId="button-empty-new-client"><Plus size={16}/>Cadastrar cliente</Button>}/>:<div className="table-scroll"><table className="data-table"><thead><tr><th>CLIENTE</th><th>CONTATO</th><th>DOCUMENTO</th><th>CADASTRO</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{clients.map(c=><tr key={c.id} data-testid={`row-client-${c.id}`}><td><div className="client-cell"><span className="client-avatar">{initials(c.name)}</span><span><strong>{c.name}</strong><small>{c.companyName||'Pessoa física'}</small></span></div></td><td><span className="contact-line">{c.email||'—'}</span><small className="contact-sub">{c.phone||''}</small></td><td className="mono-cell">{c.document||'—'}</td><td>{dateBR(c.createdAt)}</td><td><div className="row-actions"><button className="icon-button" title="Editar cliente" onClick={()=>setEditing(c)} data-testid={`button-edit-client-${c.id}`}><Pencil size={15}/></button><button className="icon-button danger-icon" title="Excluir cliente" onClick={()=>remove(c)} disabled={del.isPending} data-testid={`button-delete-client-${c.id}`}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
    </section>{(dialog||editing)&&<ClientDialog client={editing} onClose={()=>{setDialog(false);setEditing(null)}} onSaved={setToast}/>}<Toast message={toast} onClose={()=>setToast('')}/>
  </>;
}

type OrderDraft={clientId:string,title:string,description:string,material:string,color:string,quantity:string,amount:string,status:OrderStatus,dueDate:string};
const emptyOrder:OrderDraft={clientId:'',title:'',description:'',material:'',color:'',quantity:'1',amount:'0',status:'orcamento',dueDate:''};
function OrderDialog({order,onClose,onSaved}:{order?:Order|null,onClose:()=>void,onSaved:(message:string)=>void}) {
  const clientsQ=useListClients();const clients=clientsQ.data??[];
  const [form,setForm]=useState<OrderDraft>(order?{clientId:String(order.clientId),title:order.title,description:order.description||'',material:order.material||'',color:order.color||'',quantity:String(order.quantity),amount:String(order.amount),status:order.status,dueDate:order.dueDate?order.dueDate.slice(0,10):''}:emptyOrder);
  const qc=useQueryClient();const create=useCreateOrder();const update=useUpdateOrder();const pending=create.isPending||update.isPending;
   const submit=(e:FormEvent)=>{e.preventDefault();const payload={clientId:Number(form.clientId),title:form.title,description:form.description||null,material:form.material||null,color:form.color||null,quantity:Number(form.quantity),amount:Number(form.amount),status:form.status,dueDate:form.dueDate||null};const done=()=>{qc.invalidateQueries({queryKey:getListOrdersQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});if(order)qc.invalidateQueries({queryKey:getGetOrderQueryKey(order.id)});onSaved(order?'Pedido atualizado.':'Pedido criado.');onClose();};if(order)update.mutate({id:order.id,data:payload},{onSuccess:done});else create.mutate({data:payload},{onSuccess:done});};
  return <Modal title={order?'Editar pedido':'Novo pedido'} description="Registre o projeto e deixe a produção seguir." onClose={onClose}><form className="form-grid" onSubmit={submit}>
    <Field label="Cliente *"><select className="text-input" required value={form.clientId} onChange={e=>setForm({...form,clientId:e.target.value})} data-testid="select-order-client"><option value="">Selecione um cliente</option>{clients.map(c=><option value={c.id} key={c.id}>{c.name}{c.companyName?` · ${c.companyName}`:''}</option>)}</select></Field>
    <Field label="Nome do projeto *"><TextInput required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Ex.: Suporte para luminária" data-testid="input-order-title"/></Field>
    <Field label="Material"><TextInput value={form.material} onChange={e=>setForm({...form,material:e.target.value})} placeholder="PLA, PETG..." data-testid="input-order-material"/></Field>
    <Field label="Cor"><TextInput value={form.color} onChange={e=>setForm({...form,color:e.target.value})} placeholder="Branco, azul..." data-testid="input-order-color"/></Field>
    <Field label="Quantidade"><TextInput type="number" min="1" required value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} data-testid="input-order-quantity"/></Field>
    <Field label="Valor total (R$)"><TextInput type="number" min="0" step="0.01" required value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} data-testid="input-order-amount"/></Field>
    <Field label="Prazo de entrega"><TextInput type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})} data-testid="input-order-due-date"/></Field>
    <Field label="Etapa atual"><select className="text-input" value={form.status} onChange={e=>setForm({...form,status:e.target.value as OrderStatus})} data-testid="select-order-status">{STATUSES.map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></Field>
    <Field label="Descrição" wide><textarea className="text-input textarea" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Especificações ou observações do projeto" data-testid="input-order-description"/></Field>
    <div className="modal-actions"><Button variant="secondary" onClick={onClose} testId="button-cancel-order">Cancelar</Button><Button type="submit" disabled={pending||clientsQ.isLoading||clients.length===0} testId="button-save-order">{pending?'Salvando…':order?'Salvar alterações':'Criar pedido'}</Button></div>
    {clients.length===0&&!clientsQ.isLoading&&<p className="form-error">Cadastre um cliente antes de criar um pedido.</p>}{create.isError||update.isError?<p className="form-error">Não foi possível salvar o pedido. Tente novamente.</p>:null}
  </form></Modal>;
}

function OrdersPage() {
  const [search,setSearch]=useState('');const [status,setStatus]=useState('');const [createOpen,setCreateOpen]=useState(false);const [editing,setEditing]=useState<Order|null>(null);const [toast,setToast]=useState('');
  const params=useMemo(()=>({...search?{search}:{},...status?{status:status as OrderStatus}:{}}),[search,status]);
  const q=useListOrders(Object.keys(params).length?params:undefined);const qc=useQueryClient();const del=useDeleteOrder();const orders=q.data??[];
   const remove=(o:Order)=>{if(window.confirm(`Excluir o pedido ${o.orderNumber} — ${o.title}? Esta ação não pode ser desfeita.`))del.mutate({id:o.id},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListOrdersQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});setToast('Pedido removido.');},onError:()=>setToast('Não foi possível excluir o pedido.')});};
  return <><PageHeading eyebrow="PRODUÇÃO" title="Pedidos" description="Do primeiro orçamento à peça entregue, tudo em movimento." action={<Button onClick={()=>setCreateOpen(true)} testId="button-new-order"><Plus size={17}/>Novo pedido</Button>}/>
    <section className="panel table-panel"><div className="list-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar pedido, projeto ou cliente" aria-label="Buscar pedidos" data-testid="input-search-orders"/>{search&&<button onClick={()=>setSearch('')} aria-label="Limpar busca" data-testid="button-clear-order-search"><X size={15}/></button>}</div><label className="filter-select"><Filter size={15}/><select value={status} onChange={e=>setStatus(e.target.value)} aria-label="Filtrar por etapa" data-testid="select-filter-status"><option value="">Todas as etapas</option>{STATUSES.map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select><ChevronDown size={14}/></label><span className="result-count">{q.isLoading?'':`${orders.length} ${orders.length===1?'pedido':'pedidos'}`}</span></div>
      {q.isLoading?<LoadingRows count={5}/>:q.isError?<QueryError retry={()=>q.refetch()}/>:orders.length===0?<EmptyState title={search||status?'Nenhum pedido nesta busca':'Sua fila está vazia'} body={search||status?'Remova alguns filtros para ver outros pedidos.':'Quando um projeto chegar, registre-o por aqui e acompanhe cada etapa.'} action={!search&&!status&&<Button onClick={()=>setCreateOpen(true)} testId="button-empty-new-order"><Plus size={16}/>Criar pedido</Button>}/>:<div className="table-scroll"><table className="data-table order-table"><thead><tr><th>PEDIDO</th><th>CLIENTE</th><th>ETAPA</th><th>PRAZO</th><th>VALOR</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{orders.map(o=><tr key={o.id} data-testid={`row-order-${o.id}`}><td><Link href={`/pedidos/${o.id}`} className="project-link" data-testid={`link-order-${o.id}`}><strong>{o.title}</strong><small>{o.orderNumber}</small></Link></td><td><span className="client-name-cell">{o.clientName}</span></td><td><StatusPill status={o.status}/></td><td>{dateBR(o.dueDate)}</td><td className="value-cell">{brl(o.amount)}</td><td><div className="row-actions"><Link className="icon-button" href={`/pedidos/${o.id}`} title="Abrir pedido" data-testid={`button-open-order-${o.id}`}><ArrowRight size={16}/></Link><button className="icon-button" title="Editar pedido" onClick={()=>setEditing(o)} data-testid={`button-edit-order-${o.id}`}><Pencil size={15}/></button><button className="icon-button danger-icon" title="Excluir pedido" onClick={()=>remove(o)} disabled={del.isPending} data-testid={`button-delete-order-${o.id}`}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
    </section>{(createOpen||editing)&&<OrderDialog order={editing} onClose={()=>{setCreateOpen(false);setEditing(null)}} onSaved={setToast}/>}<Toast message={toast} onClose={()=>setToast('')}/>
  </>;
}

function DetailPage() {
  const params=useParams<{id:string}>();const [,setLocation]=useLocation();const id=Number(params.id);const [editing,setEditing]=useState(false);const [toast,setToast]=useState('');const [uploadCategory,setUploadCategory]=useState<'nota_fiscal'|'orcamento'|'referencia'|'outro'>('outro');const [uploading,setUploading]=useState(false);const [uploadError,setUploadError]=useState('');
  const q=useGetOrder(id,{query:{enabled:Number.isFinite(id)&&id>0,queryKey:getGetOrderQueryKey(id)}});const eventsQ=useListOrderEvents(id,{query:{enabled:Number.isFinite(id)&&id>0,queryKey:getListOrderEventsQueryKey(id)}});const filesQ=useListOrderAttachments(id,{query:{enabled:Number.isFinite(id)&&id>0,queryKey:getListOrderAttachmentsQueryKey(id)}});
  const clientQ=useGetClient(q.data?.clientId??0,{query:{enabled:!!q.data?.clientId,queryKey:getGetClientQueryKey(q.data?.clientId??0)}});const client=clientQ.data;
  const update=useUpdateOrder();const del=useDeleteOrder();const createAttachment=useCreateOrderAttachment();const deleteAttachment=useDeleteOrderAttachment();const qc=useQueryClient();
  const changeStatus=(status:OrderStatus)=>{if(!q.data)return;update.mutate({id,data:{status}},{onSuccess:()=>{qc.invalidateQueries({queryKey:getGetOrderQueryKey(id)});qc.invalidateQueries({queryKey:getListOrdersQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});qc.invalidateQueries({queryKey:getListOrderEventsQueryKey(id)});setToast('Etapa atualizada.');}});};
  const uploadFile=async(file?:File)=>{if(!file)return;if(file.size>10485760){setUploadError('O arquivo deve ter até 10 MB.');return;}setUploadError('');setUploading(true);try{const mime=file.type||'application/octet-stream';const objectPath=`orders/${id}/${crypto.randomUUID()}`;const blob=await upload(objectPath,file,{access:'private',handleUploadUrl:'/api/storage/uploads/request-url',clientPayload:JSON.stringify({orderId:id,size:file.size,contentType:mime})});await createAttachment.mutateAsync({id,data:{fileName:file.name,contentType:mime,size:file.size,category:uploadCategory,objectPath:blob.pathname}});await qc.invalidateQueries({queryKey:getListOrderAttachmentsQueryKey(id)});setToast('Documento anexado.');}catch{setUploadError('Não foi possível anexar o documento. Tente novamente.');}finally{setUploading(false);}};
  const removeFile=(a:Attachment)=>{if(window.confirm(`Excluir o documento ${a.fileName}?`))deleteAttachment.mutate({id,attachmentId:a.id},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListOrderAttachmentsQueryKey(id)});setToast('Documento removido.');},onError:()=>setToast('Não foi possível excluir o documento.')});};
  const removeOrder=()=>{if(!q.data)return;if(window.confirm(`Excluir o pedido ${q.data.orderNumber}? Esta ação não pode ser desfeita.`))del.mutate({id},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListOrdersQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});setLocation('/pedidos');},onError:()=>setToast('Não foi possível excluir o pedido e seus documentos.')});};
  if(q.isLoading)return <div className="detail-loading"><LoadingRows count={4}/></div>;
  if(q.isError||!q.data)return <><Link href="/pedidos" className="back-link" data-testid="link-back-orders"><ArrowLeft size={16}/>Voltar aos pedidos</Link><QueryError retry={()=>q.refetch()}/></>;
  const order=q.data;
  return <><div className="detail-backline"><Link href="/pedidos" className="back-link" data-testid="link-back-orders"><ArrowLeft size={16}/>Pedidos</Link><span>/</span><span>{order.orderNumber}</span></div>
    <div className="detail-heading"><div><div className="eyebrow">PEDIDO {order.orderNumber}</div><h1>{order.title}</h1><div className="detail-heading-meta"><StatusPill status={order.status}/><span>Aberto em {dateBR(order.createdAt)}</span></div></div><div className="heading-action"><Button variant="secondary" onClick={()=>setEditing(true)} testId="button-edit-order-detail"><Pencil size={16}/>Editar pedido</Button><Button variant="quiet" onClick={removeOrder} testId="button-delete-order-detail"><Trash2 size={16}/>Excluir</Button></div></div>
    <div className="detail-layout"><div className="detail-main">
      <section className="panel progress-panel"><div className="panel-head"><div><span className="eyebrow">PROGRESSO DO PROJETO</span><h2>Etapa de produção</h2></div>{update.isPending&&<span className="saving-label">Salvando…</span>}</div><div className="status-control"><label htmlFor="detail-status">Etapa atual</label><select id="detail-status" className="text-input" value={order.status} disabled={update.isPending} onChange={e=>changeStatus(e.target.value as OrderStatus)} data-testid="select-detail-status">{STATUSES.map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div><div className="progress-steps">{STATUSES.filter(s=>s!=='cancelado').map((s,i)=>{const now=order.status==='cancelado'?-1:STATUSES.filter(x=>x!=='cancelado').indexOf(order.status);return <div className={`progress-step ${i<=now?'step-done':''} ${i===now?'step-current':''}`} key={s}><span className="step-point">{i<now?<Check size={12}/>:String(i+1).padStart(2,'0')}</span><span>{STATUS_LABEL[s]}</span></div>})}</div></section>
      <section className="panel timeline-panel"><div className="panel-head"><div><span className="eyebrow">REGISTRO DO PROJETO</span><h2>Histórico</h2></div><span className="timeline-count">{eventsQ.data?.length??0} atualizações</span></div>{eventsQ.isLoading?<LoadingRows count={2}/>:eventsQ.isError?<QueryError retry={()=>eventsQ.refetch()}/>:!eventsQ.data?.length?<div className="empty-inline"><Clock3 size={18}/><span>O histórico de etapas aparecerá aqui conforme o pedido avança.</span></div>:<div className="timeline">{[...eventsQ.data].reverse().map((event,i)=><div className="timeline-item" key={event.id} data-testid={`timeline-event-${event.id}`}><span className={`timeline-dot ${i===0?'dot-current':''}`}/><div className="timeline-copy"><strong>{event.fromStatus?`${STATUS_LABEL[event.fromStatus]} → ${STATUS_LABEL[event.toStatus]}`:`Pedido criado · ${STATUS_LABEL[event.toStatus]}`}</strong>{event.note&&<p>{event.note}</p>}<time>{dateTimeBR(event.createdAt)}</time></div></div>)}</div>}</section>
      <section className="panel documents-panel"><div className="panel-head"><div><span className="eyebrow">PAPELADA DO PEDIDO</span><h2>Documentos</h2></div><span className="timeline-count">{filesQ.data?.length??0} arquivos</span></div>
         <div className="upload-tools"><label className="filter-select"><select value={uploadCategory} onChange={e=>setUploadCategory(e.target.value as typeof uploadCategory)} aria-label="Categoria do documento" data-testid="select-document-category"><option value="nota_fiscal">Nota fiscal</option><option value="orcamento">Orçamento</option><option value="referencia">Referência</option><option value="outro">Outro</option></select><ChevronDown size={14}/></label><label className={`btn btn-secondary upload-label ${uploading?'disabled':''}`}><Upload size={16}/>{uploading?'Enviando…':'Anexar documento'}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt" disabled={uploading} onChange={e=>{void uploadFile(e.target.files?.[0]);e.currentTarget.value='';}} data-testid="input-upload-document" /></label></div>
        {uploadError&&<div className="inline-error" role="alert">{uploadError}</div>}
        {filesQ.isLoading?<LoadingRows count={2}/>:filesQ.isError?<QueryError retry={()=>filesQ.refetch()}/>:!filesQ.data?.length?<div className="empty-inline"><FileText size={18}/><span>Nenhum documento anexado ainda. Adicione notas, orçamentos ou referências.</span></div>:<div className="file-list">{filesQ.data.map(a=><div className="file-row" key={a.id} data-testid={`row-attachment-${a.id}`}><span className="file-icon"><FileText size={17}/></span><span className="file-copy"><strong>{a.fileName}</strong><small>{a.category.replaceAll('_',' ')} · {formatBytes(a.size)} · {dateBR(a.createdAt)}</small></span><a className="icon-button" href={`/api/storage/objects/${a.objectPath}`} target="_blank" rel="noreferrer" title="Abrir documento" data-testid={`link-open-attachment-${a.id}`}><ExternalLink size={16}/></a><button className="icon-button danger-icon" onClick={()=>removeFile(a)} title="Excluir documento" data-testid={`button-delete-attachment-${a.id}`}><Trash2 size={15}/></button></div>)}</div>}
      </section>
    </div><aside className="detail-side">
      <section className="panel order-facts"><div className="panel-head compact"><div><span className="eyebrow">RESUMO</span><h2>Detalhes</h2></div><Settings2 size={17} className="subtle-icon"/></div><div className="fact-row"><span>Valor do pedido</span><strong className="fact-amount">{brl(order.amount)}</strong></div><div className="fact-row"><span>Quantidade</span><strong>{order.quantity} {order.quantity===1?'unidade':'unidades'}</strong></div><div className="fact-row"><span>Material</span><strong>{order.material||'Não informado'}</strong></div><div className="fact-row"><span>Cor</span><strong>{order.color||'Não informada'}</strong></div><div className="fact-row"><span>Prazo</span><strong>{dateBR(order.dueDate)}</strong></div>{order.description&&<div className="description-fact"><span>Descrição</span><p>{order.description}</p></div>}</section>
      <section className="panel contact-card"><div className="panel-head compact"><div><span className="eyebrow">RELACIONAMENTO</span><h2>Cliente</h2></div><BriefcaseBusiness size={17} className="subtle-icon"/></div>{client?<><div className="contact-person"><span className="client-avatar large">{initials(client.name)}</span><div><strong>{client.name}</strong><small>{client.companyName||'Pessoa física'}</small></div></div><div className="contact-details">{client.email&&<p><span>E-mail</span><a href={`mailto:${client.email}`} data-testid="link-client-email">{client.email}</a></p>}{client.phone&&<p><span>Telefone</span><a href={`tel:${client.phone}`} data-testid="link-client-phone">{client.phone}</a></p>}{client.document&&<p><span>CPF / CNPJ</span><strong>{client.document}</strong></p>}{client.address&&<p><span>Endereço</span><strong>{client.address}</strong></p>}{client.notes&&<p><span>Observações</span><strong>{client.notes}</strong></p>}</div></>:<div className="empty-inline">Dados do cliente indisponíveis.</div>}</section>
      <div className="side-reminder"><span><ArrowDownRight size={17}/></span><div><strong>Próximo passo</strong><p>Mantenha o status atualizado para ter o histórico completo do projeto.</p></div></div>
    </aside></div>
    {editing&&<OrderDialog order={order} onClose={()=>setEditing(false)} onSaved={setToast}/>}<Toast message={toast} onClose={()=>setToast('')}/>
  </>;
}
function formatBytes(bytes:number) {if(bytes<1024)return `${bytes} B`;if(bytes<1048576)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/1048576).toFixed(1)} MB`;}

function Router() {
  return <Shell><RoutedErrorBoundary><Switch><Route path="/" component={DashboardPage}/><Route path="/clientes" component={ClientsPage}/><Route path="/pedidos" component={OrdersPage}/><Route path="/pedidos/:id" component={DetailPage}/><Route component={NotFound}/></Switch></RoutedErrorBoundary></Shell>;
}
function RoutedErrorBoundary({children}:{children:ReactNode}) {const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;}
function App() {return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;}
export default App;
