CREATE TYPE "public"."print_order_status" AS ENUM('orcamento', 'aguardando_aprovacao', 'em_impressao', 'pos_processamento', 'pronto', 'entregue', 'cancelado');--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"password_hash" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "print_order_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" varchar NOT NULL,
	"order_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"category" varchar(32) NOT NULL,
	"object_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_order_attachments_object_path_unique" UNIQUE("object_path")
);
--> statement-breakpoint
CREATE TABLE "print_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" varchar NOT NULL,
	"name" text NOT NULL,
	"company_name" text,
	"email" text,
	"phone" text,
	"document" text,
	"address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" varchar NOT NULL,
	"order_id" integer NOT NULL,
	"from_status" "print_order_status",
	"to_status" "print_order_status" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" varchar NOT NULL,
	"client_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"material" text,
	"color" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "print_order_status" DEFAULT 'orcamento' NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "print_order_attachments" ADD CONSTRAINT "print_order_attachments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_order_attachments" ADD CONSTRAINT "print_order_attachments_order_id_print_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."print_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_clients" ADD CONSTRAINT "print_clients_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_order_events" ADD CONSTRAINT "print_order_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_order_events" ADD CONSTRAINT "print_order_events_order_id_print_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."print_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_orders" ADD CONSTRAINT "print_orders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_orders" ADD CONSTRAINT "print_orders_client_id_print_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."print_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "print_order_attachments_order_idx" ON "print_order_attachments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "print_order_attachments_owner_idx" ON "print_order_attachments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "print_clients_owner_idx" ON "print_clients" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "print_order_events_order_idx" ON "print_order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "print_orders_owner_idx" ON "print_orders" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "print_orders_client_idx" ON "print_orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "print_orders_status_idx" ON "print_orders" USING btree ("owner_id","status");