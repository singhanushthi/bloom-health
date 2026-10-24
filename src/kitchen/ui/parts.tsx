/**
 * Kitchen UI parts. Same language as Bloom's primitives: ink/muted text only, accents for
 * graphics, ≥44 dp targets, and meaning always carried by text + icon (never colour alone).
 * Food uses Bloom's sage greens.
 */
import { router } from 'expo-router';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChefHat,
  Clock,
  Cookie,
  Flame,
  Leaf,
  Minus,
  ShoppingCart,
  Sparkles,
  Timer,
  type LucideIcon,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Card, CardHeader, Text } from '../../components/ui';
import { RECIPE_MEAL_LABEL, TAG_LABEL, type Recipe, type RecipeTag } from '../../content/recipes';
import { fonts, radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import type { HealthCheck, HealthLabel, Level } from '../healthCheck';
import { LEVEL_TEXT } from '../healthCheck';
import type { RecipeMatch } from '../match';
import { expiryState, expiryText, type PantryItem } from '../pantry';

/* -------------------------------- Colours ------------------------------- */

export interface FoodColors {
  /** Graphics / icons. */
  food: string;
  /** Strong sage for borders and icon accents on soft backgrounds. */
  foodStrong: string;
  /** Soft background tint. */
  foodSoft: string;
}

export function useFoodColors(): FoodColors {
  const { scheme } = useTheme();
  return scheme === 'dark'
    ? { food: '#8CC08F', foodStrong: '#B5DDB7', foodSoft: '#8CC08F2E' }
    : { food: '#5E8C61', foodStrong: '#3F6B43', foodSoft: '#E1EEDC' };
}

/* ------------------------------ Small chips ----------------------------- */

export function MetaChip({ icon: Icon, label, bg, iconColor }: { icon?: LucideIcon; label: string; bg?: string; iconColor?: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: bg ?? c.surfaceAlt,
        borderRadius: radius.pill,
        paddingHorizontal: space.sm,
        paddingVertical: 5,
        alignSelf: 'flex-start',
      }}
    >
      {Icon ? <Icon size={14} color={iconColor ?? c.ink} /> : null}
      <Text variant="caption">{label}</Text>
    </View>
  );
}

export function TagChips({ tags, max = 3 }: { tags: RecipeTag[]; max?: number }) {
  const f = useFoodColors();
  if (!tags.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {tags.slice(0, max).map((t) => (
        <MetaChip key={t} label={TAG_LABEL[t]} bg={f.foodSoft} />
      ))}
    </View>
  );
}

/** "Use soon" chip — icon + words; nothing for items without a date or far from it. */
export function ExpiryChip({ item, today }: { item: Pick<PantryItem, 'expiresOn'>; today: string }) {
  const { c } = useTheme();
  const st = expiryState(item, today);
  const text = expiryText(item, today);
  if (!text || st === 'ok' || st === 'none') return null;
  return <MetaChip icon={Clock} label={text} bg={st === 'expired' ? c.heartSoft : c.stepsSoft} iconColor={st === 'expired' ? c.heart : c.steps} />;
}

/* ------------------------------ Health check ---------------------------- */

const LABEL_ICON: Record<HealthLabel, LucideIcon> = { everyday: Leaf, sometimes: Clock, treat: Cookie };
const LEVEL_ICON: Record<Level, LucideIcon> = { low: ArrowDown, medium: Minus, high: ArrowUp };

export function HealthBadge({ check, compact }: { check: HealthCheck; compact?: boolean }) {
  const { c } = useTheme();
  const f = useFoodColors();
  const tone =
    check.label === 'everyday'
      ? { bg: f.foodSoft, fg: f.foodStrong }
      : check.label === 'sometimes'
        ? { bg: c.stepsSoft, fg: c.steps }
        : { bg: c.cycleSoft, fg: c.cycle };
  const Icon = LABEL_ICON[check.label];
  return (
    <View
      accessible
      accessibilityLabel={`Health check: ${check.title}. ${check.message}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: tone.bg, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: compact ? 4 : 6, alignSelf: 'flex-start' }}
    >
      <Icon size={compact ? 14 : 16} color={tone.fg} />
      <Text variant={compact ? 'caption' : 'bodyStrong'}>{check.title}</Text>
    </View>
  );
}

export function HealthCheckCard({ check }: { check: HealthCheck }) {
  const { c } = useTheme();
  const f = useFoodColors();
  return (
    <Card>
      <View accessible accessibilityLabel={check.summary}>
        <CardHeader icon={Leaf} label="Health check · per 100 g" accent={f.food} soft={f.foodSoft} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
          <HealthBadge check={check} />
          {check.nutriscore ? <MetaChip label={`Nutri-Score ${check.nutriscore}`} /> : null}
        </View>
        <Text style={{ marginTop: space.xs }}>{check.message}</Text>
        <View style={{ marginTop: space.sm, gap: 6 }}>
          {check.rows.map((r) => {
            const I = LEVEL_ICON[r.level];
            return (
              <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 28 }}>
                <Text style={{ flex: 1 }}>{r.label}</Text>
                <Text variant="bodyStrong">{r.value >= 10 ? Math.round(r.value) : Math.round(r.value * 10) / 10} g</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 84, justifyContent: 'flex-end' }}>
                  <I size={14} color={r.level === 'high' ? c.cycle : r.level === 'low' ? f.food : c.steps} />
                  <Text variant="caption" tone="muted">
                    {LEVEL_TEXT[r.level]}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        {check.positives.map((p) => (
          <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Check size={16} color={f.food} />
            <Text variant="caption">{p}</Text>
          </View>
        ))}
        <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
          Based on UK FSA front-of-pack guide levels. No food is off-limits — this is just a nudge.
        </Text>
      </View>
    </Card>
  );
}

/* ------------------------------- Recipe card ---------------------------- */

export function recipeA11y(r: Recipe, m?: RecipeMatch | null, showPantry = true): string {
  const have = m && showPantry ? (m.missing.length ? `Missing ${m.missing.map((x) => x.name).join(', ')}.` : 'You have everything.') : '';
  return `${r.title}. ${r.timeMin} minutes. About ${r.perServing.kcal} kilocalories and ${Math.round(r.perServing.protein)} grams protein per serving. ${have} ${m?.fitNote ?? ''}`.trim();
}

export function RecipeCard({
  recipe,
  match,
  showFit = true,
  showPantry = true,
}: {
  recipe: Recipe;
  match?: RecipeMatch | null;
  showFit?: boolean;
  /** Show have/need (off when the kitchen is empty). */
  showPantry?: boolean;
}) {
  const { c } = useTheme();
  const f = useFoodColors();
  const missing = showPantry ? (match?.missing ?? null) : null;
  return (
    <Pressable
      onPress={() => router.push(`/kitchen/recipe/${encodeURIComponent(recipe.id)}`)}
      accessibilityRole="button"
      accessibilityLabel={recipeA11y(recipe, match, showPantry)}
      accessibilityHint="Opens the recipe"
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        backgroundColor: c.surface,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: c.line,
        padding: space.md,
        gap: space.xs,
        minHeight: touch.min,
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: f.foodSoft, alignItems: 'center', justifyContent: 'center' }}>
          {recipe.source === 'ai' ? <Sparkles size={22} color={f.foodStrong} /> : <ChefHat size={22} color={f.foodStrong} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" style={{ fontSize: 17 }}>
            {recipe.title}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: 2 }}>
            <InlineMeta icon={Timer} text={`${recipe.timeMin} min`} />
            <InlineMeta icon={Flame} text={`${recipe.perServing.kcal} kcal`} />
            <Text variant="caption" tone="muted">
              {Math.round(recipe.perServing.protein)} g protein
            </Text>
          </View>
        </View>
      </View>
      {missing ? (
        missing.length === 0 ? (
          <MetaChip icon={Check} label="You have everything" bg={f.foodSoft} iconColor={f.foodStrong} />
        ) : (
          <MetaChip icon={ShoppingCart} label={`Need: ${missing.map((x) => x.name).slice(0, 3).join(', ')}${missing.length > 3 ? ` +${missing.length - 3}` : ''}`} />
        )
      ) : null}
      {showFit && match?.fitNote ? (
        <Text variant="caption" tone="muted">
          {match.fitNote}
        </Text>
      ) : (
        <Text variant="caption" tone="muted">
          {recipe.meal.map((m) => RECIPE_MEAL_LABEL[m]).join(' · ')}
        </Text>
      )}
    </Pressable>
  );
}

function InlineMeta({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon size={13} color={c.muted} />
      <Text variant="caption" tone="muted">
        {text}
      </Text>
    </View>
  );
}

/** Big Instrument Serif number with a small label underneath. */
export function BigStat({ value, label }: { value: string; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', minWidth: 56 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: c.ink }}>{value}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/** Section heading inside the Kitchen screens. */
export function KitchenSection({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.sm }}>
      <View style={{ flex: 1 }}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
