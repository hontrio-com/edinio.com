# Ieșirea către eMAG, pe IP fix

## De ce există serverul ăsta

eMAG acceptă apeluri **numai de la adrese IP declarate în prealabil** de vânzător.
Edinio rulează pe Vercel, unde funcțiile nu au IP de ieșire fix. Fără un punct de
ieșire stabil, integrarea nu merge pentru niciun comerciant, iar răspunsul primit
de la eMAG nu spune de ce.

Serverul are IP fix. Comerciantul îl albește **o singură dată** în contul lui eMAG.

## Ce e, și ce nu e

E un **proxy CONNECT**. Deschide un tunel și copiază octeți. Nu termină TLS, nu
citește nimic, nu păstrează nimic.

Asta nu e o alegere de comoditate. La `CONNECT`, criptarea rămâne cap la cap între
Edinio și eMAG, deci **parola eMAG a comerciantului trece prin server necitibilă**.
Un releu care ar termina TLS ar fi devenit al doilea loc din care se pot citi
credențialele tuturor comercianților, pentru exact același folos.

## Instalare

```
scp -r scripts/emag-proxy root@<IP>:/root/
ssh root@<IP>
bash /root/emag-proxy/instaleaza.sh
```

Scriptul generează parola și o arată **o singură dată**. Se scrie imediat în Vercel:

```
EMAG_PROXY_URL=http://edinio:<parola>@<IP>:3128
EMAG_PROXY_IP=<IP>
```

`EMAG_PROXY_IP` e separat dinadins: adresa proxy-ului conține acreditări și n-are
ce căuta pe un ecran, dar IP-ul de albit trebuie arătat comerciantului chiar în
pagina de conectare.

## Cele două apărări

Proxy-ul **nu poate** fi restrâns pe IP de intrare — tocmai lipsa unui IP fix la
Vercel e problema pe care o rezolvă. Deci la intrare e doar parola.

De aceea a doua apărare e obligatorie: **lista de gazde**. Chiar dacă parola s-ar
scurge, proxy-ul răspunde numai pentru `marketplace-api.emag.{ro,bg,hu}`, numai pe
443. Nu poate fi folosit ca releu deschis.

Plus `fail2ban`: cinci încercări greșite într-un sfert de oră, o oră de pauză.

## ⚠ Ce nu se face niciodată

**Nu se șterge și nu se recreează serverul.** Oprit și pornit e în regulă. Șters,
vine cu alt IP — și atunci fiecare comerciant trebuie să umble din nou prin panoul
eMAG. Ăsta e singurul lucru de aici care nu se poate reface din scriptul de față.

De aceea nu se plătește nici copie de siguranță la Contabo: nu există nicio stare
de salvat. Tot ce e aici se reface în zece minute; adresa IP nu.

Dacă vrei să nu depinzi niciodată de viața unui server anume, Contabo vinde IP-uri
suplimentare care se pot muta între mașini. Nu e nevoie acum.

## Verificare

Trei probe, toate de pe server. Fiecare trebuie să dea exact ce scrie:

```bash
# 1. cererea AJUNGE la eMAG (401 de la ei, fiindcă n-am trimis acreditări eMAG)
curl -sS -o /dev/null -w '%{http_code}\n' -x http://edinio:PAROLA@127.0.0.1:3128 \
     https://marketplace-api.emag.ro/api-3/vat/read -X POST -d '{}'

# 2. lista de gazde ține (403 de la proxy)
curl -sS -o /dev/null -w '%{http_code}\n' -x http://edinio:PAROLA@127.0.0.1:3128 \
     https://example.com

# 3. parola chiar e cerută (407)
curl -sS -o /dev/null -w '%{http_code}\n' -x http://127.0.0.1:3128 \
     https://marketplace-api.emag.ro/api-3/vat/read
```

Dacă a doua dă 200, lista de gazde nu ține și proxy-ul e deschis. Se oprește
serviciul și se reia configurarea.

## Întreținere

```bash
systemctl status squid            # merge?
tail -f /var/log/squid/access.log # cine cere, când, către ce gazdă
fail2ban-client status squid      # cine a fost oprit
squid -k parse                    # configurația e validă?
squid -k reconfigure              # o reîncarcă fără să taie tunelurile deschise
```

Jurnalul se păstrează 30 de zile, cât recomandă chiar documentația eMAG. Nu se vede
conținutul — e tunel cifrat — dar se vede cine a cerut, când și către ce gazdă,
adică exact ce trebuie ca să se răspundă la „a plecat cererea de la noi?".

## Actualizări de securitate

```bash
apt-get update && apt-get upgrade -y
```

Merită o dată pe lună. Serverul e expus pe internet cu un singur port deschis în
afară de SSH, dar `squid` e software care primește cereri de la oricine.
