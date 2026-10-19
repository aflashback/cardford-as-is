package trixcollection

import (
	"strings"

	"cardford/server/internal/gamekernel"
)

type Rules struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Text        string `json:"text"`
	Objective   string `json:"objective"`
}

// RulesDescriptor is TSC-04 common episode text. Literal amounts and routing
// follow games/trix/{engine,score}.go and docs/rules/trix.md (TRX-D01/D02).
func RulesDescriptor(pin gamekernel.Pin, request string) (Rules, error) {
	if err := validateRequest(pin, request); err != nil {
		return Rules{}, err
	}
	names := map[string]string{"diamonds": "Diamonds", "king": "King of Hearts", "queens": "Queens", "lutoosh": "Lutoosh (Collections)", "complex": "Combined penalties"}
	kind := "Basic"
	if strings.HasPrefix(pin.VariantID, "complex-") {
		kind = "Complex"
	}
	competition, objective := "Solo", "own-request-points"
	if strings.HasSuffix(pin.VariantID, "partners") {
		competition, objective = "Partners", "combined-team-request-points"
	}
	r := Rules{Name: "Trix " + kind + " " + competition + " — " + names[request], Objective: objective}
	r.Description = "Four players use a standard 52-card deck, thirteen cards per seat. This episode is one complete " + names[request] + " request; higher final request points are better."
	r.Text = "Native seats: 0=South, 1=West, 2=North, 3=East. Turns move right: South→East→North→West→South. The H7 holder owns this initial deal and starts the selected request. Rank order is 2<3<4<5<6<7<8<9<10<J<Q<K<A. Follow led suit when held; otherwise any held card is legal. Highest led-suit card wins; there is no trump. Winner leads next. No duty to beat, mandatory penalty discard, special K♥ discard obligation, or restriction on leading hearts. Play all 52 cards through thirteen complete tricks even after all relevant penalty cards are captured. Stop at the first native round-complete boundary. "
	if competition == "Partners" {
		r.Text += "South/North (0,2) form NS; West/East (1,3) form EW. Maximize combined own-team final request points, including direct team bonuses. "
	} else {
		r.Text += "All four seats compete individually; maximize own final request points. "
	}
	amounts := map[string]string{
		"diamonds": "Each captured diamond costs −10 points; complete ordinary request total −130. No declarations.",
		"lutoosh":  "Each captured trick costs −15 points; complete request total −195. No declarations.",
		"queens":   "Each captured queen costs −25 points; a doubled queen costs −50 with a +25 bonus. Ordinary global total −100.",
		"king":     "Captured K♥ costs −75 points; doubled K♥ costs −150 with a +75 bonus. Ordinary global total −75.",
		"complex":  "All components add: each trick −15; each diamond −10; each queen −25 (doubled −50 and +25 bonus); K♥ −75 (doubled −150 and +75 bonus). Ordinary global total −500. A trick with doubled Q♦ as its sole penalty card debits the capturer −75: −15 trick, −10 diamond, −50 queen; route its +25 bonus separately once.",
	}
	r.Text += amounts[request] + " "
	if request == "queens" || request == "king" || request == "complex" {
		r.Text += "Before play, four public sequential declaration turns start with the owner and move right. Each holder may double any subset of eligible held cards, including none. Queens are eligible in Queens/Complex; K♥ in King/Complex. Earlier declarations are public; declining does not reveal whether eligible cards were held. The owner starts play after the fourth declaration. Doubling replaces the ordinary queen/king debit; independent diamond and trick debits still apply. "
		if competition == "Partners" {
			r.Text += "Any doubled-card capture, including announcer or teammate capture, debits the capturing team and credits the opposite team the bonus. The debit is a seat ledger entry; the bonus is a direct competitor ledger entry, summed exactly once. Credited double bonuses preserve ordinary global totals."
		} else {
			r.Text += "When capturer differs from announcer, credit the announcer. When announcer captures on another seat's lead, credit that trick leader. When announcer leads and captures, credit their last prior external leader in this deal. Record no_previous_external_leader and withhold the bonus if none exists; keep the doubled debit. On each non-self-led win, update the winner's external leader before scoring; self-led wins preserve it. Fresh dealing resets this provenance. Credited double bonuses preserve ordinary global totals; subtract withheld bonus values from the global total."
		}
	}
	return r, nil
}
