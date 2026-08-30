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

```bash
bash /root/emag-proxy/proba.sh
```

Cere parola o dată și scrie **TRECUT** sau **CĂZUT** pentru fiecare din cele trei:

| Probă | Ce dovedește |
|---|---|
| eMAG răspunde `401` | cererea a trecut prin releu și a ajuns la ei |
| `example.com` refuzat cu `403` | lista de gazde ține — nu e releu deschis |
| fără parolă, `407` | parola chiar e cerută |

**A doua e cea care contează.** Dacă dă `200`, proxy-ul e deschis către tot
internetul: `systemctl stop squid` și se reia configurarea.

### ⚠ De ce un script și nu trei comenzi `curl`

Fiindcă la un tunel `CONNECT` refuzat, `curl` **nu** pune codul proxy-ului în
`%{http_code}`. Tunelul nu se deschide niciodată, deci nu există niciun răspuns *de
la destinație*, iar acolo rămâne `000`. Codul adevărat iese în mesajul de eroare:

```
2. gazda straina refuzata: curl: (56) CONNECT tunnel failed, response 403
000
```

Ăsta e răspunsul **corect**, și arată ca un eșec. Prima formă a instrucțiunilor cerea
să te uiți la `%{http_code}` — cine nu știe semantica lui `CONNECT` ar fi pornit să
repare ceva întreg. Scriptul citește unde trebuie.

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
