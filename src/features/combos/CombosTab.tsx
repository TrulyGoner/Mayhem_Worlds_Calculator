import { useMemo } from "react";
import { ComboList } from "./ComboList";
import { buildCombos } from "../../lib/combos";
import type { Player } from "../../lib/game";
export function CombosTab({ players }: { players: Player[] }) {
  const combos = useMemo(() => buildCombos(players), [players]);

  return (
    <section className="full-panel">
      <div className="panel combo-intro">
        <div className="section-label">COMBINATIONS</div>
        <h2>Оптимальные комбинации</h2>
        <p className="muted">
          Лучшие пары и тройки считаются из живого рейтинга той же формулой,
          что и итоговый score, поэтому цифры здесь сопоставимы с оценкой
          состава. Каждая строка — один уникальный набор игроков: перестановки
          одного состава повторяться не могут, роли у всех разные.
        </p>
      </div>
      <ComboList
        title="ЛУЧШИЕ ПАРЫ"
        combos={combos.pairs}
        note="У двоих игроков бонус за разброс и штраф за слабое звено измеряют одну и ту же половину разрыва одним коэффициентом, поэтому взаимно сокращаются. Score пары — это ролевое среднее."
      />
      <ComboList
        title="ЛУЧШИЕ ТРОЙКИ"
        combos={combos.trios}
        note="У тройки появляется третий член бонуса, у которого нет пары в штрафе, поэтому score может отличаться от ролевого среднего."
      />
    </section>
  );
}
