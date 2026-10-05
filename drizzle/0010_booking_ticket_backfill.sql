-- Custom SQL migration file, put your code below! --
-- Give every already-confirmed active booking an e-ticket (token + code), so
-- bookings made before tickets existed can still be scanned. Idempotent: only
-- touches rows without a token. Same formats as lib/domain/ticket-codes.ts:
-- token = 16 random bytes as unpadded base64url (22 chars); code = CBX- + 4
-- chars from the look-alike-free alphabet.
DO $$
DECLARE
  b record;
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  c text;
  tries int;
BEGIN
  FOR b IN
    SELECT bk.id FROM booking bk
    WHERE bk.status = 'active'
      AND bk.ticket_token IS NULL
      AND EXISTS (
        SELECT 1 FROM reservation r
        WHERE r.booking_id = bk.id AND r.status = 'confirmed'
      )
  LOOP
    tries := 0;
    LOOP
      c := 'CBX-';
      FOR i IN 1..4 LOOP
        c := c || substr(alphabet, 1 + floor(random() * 31)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM booking WHERE ticket_code = c);
      tries := tries + 1;
      IF tries > 50 THEN
        RAISE EXCEPTION 'booking_ticket_backfill: could not allocate a ticket code';
      END IF;
    END LOOP;

    UPDATE booking SET
      ticket_token = rtrim(
        translate(
          encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'),
          '+/', '-_'),
        '='),
      ticket_code = c
    WHERE id = b.id;
  END LOOP;
END $$;
