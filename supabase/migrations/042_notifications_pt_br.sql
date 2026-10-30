-- Traduz para pt-BR o texto da notificação de atribuição de conversa
-- e as notificações já existentes.
CREATE OR REPLACE FUNCTION public.notify_conversation_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_name TEXT;
  v_actor_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_agent_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.assigned_agent_id IS NULL
       OR NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.assigned_agent_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), phone) INTO v_contact_name
  FROM contacts WHERE id = NEW.contact_id;

  IF auth.uid() IS NOT NULL THEN
    SELECT full_name INTO v_actor_name
    FROM profiles WHERE user_id = auth.uid();
  END IF;

  INSERT INTO notifications (
    account_id, user_id, type, conversation_id, contact_id,
    actor_user_id, title, body
  ) VALUES (
    NEW.account_id,
    NEW.assigned_agent_id,
    'conversation_assigned',
    NEW.id,
    NEW.contact_id,
    auth.uid(),
    'Nova conversa atribuída',
    COALESCE(v_actor_name, 'Alguém') || ' atribuiu a você uma conversa com '
      || COALESCE(v_contact_name, 'um contato')
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create assignment notification for conversation %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

UPDATE public.notifications
SET title = 'Nova conversa atribuída'
WHERE title = 'New conversation assigned';

UPDATE public.notifications
SET body = regexp_replace(
      regexp_replace(body, ' assigned you a conversation with ', ' atribuiu a você uma conversa com '),
      '^Someone atribuiu', 'Alguém atribuiu')
WHERE body LIKE '% assigned you a conversation with %';
