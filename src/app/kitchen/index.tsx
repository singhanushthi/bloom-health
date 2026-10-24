/**
 * Kitchen home: cook now, my kitchen (pantry by category), almost there, shopping list,
 * my recipes and browse all recipes. Suggestions fit the plan when there is one.
 */
import { router } from 'expo-router';
import {
  BookOpen,
  Check,
  ChefHat,
  ListPlus,
  Plus,
  ScanBarcode,
  Share2,
  ShoppingCart,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { useCoach } from '../../ai/CoachState';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { Field, Input } from '../../components/sheets/Sheet';
import { Button, Card, CardHeader, CardSkeleton, EmptyNote, IconButton, Text } from '../../components/ui';
import { RECIPE_MEAL_LABEL } from '../../content/recipes';
import { ValidationError } from '../../db/repos';
import { todayKey } from '../../health/dates';
import { healthCheck } from '../../kitchen/healthCheck';
import { CATEGORY_LABEL } from '../../kitchen/ingredients';
import { shoppingListText, type RecipeMatch } from '../../kitchen/match';
import { expiryState, groupByCategory, type PantryItem, type ShoppingItem } from '../../kitchen/pantry';
import { BigStat, ExpiryChip, HealthBadge, KitchenSection, MetaChip, RecipeCard, useFoodColors } from '../../kitchen/ui/parts';
import { useKitchen, type KitchenState } from '../../kitchen/useKitchen';
import { BackHeader, InfoNote, SmallButton } from '../../plan/ui/parts';
import { space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function KitchenHome() {
  const k = useKitchen();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await k.reload();
        setRefreshing(false);
      }}
    >
      <BackHeader title="Kitchen" subtitle="Cook healthy with what you have" />
      <DemoBanner />
      {k.error ? <Text tone="danger">{k.error}</Text> : null}
      {k.loading ? (
        <>
          <CardSkeleton label="kitchen" height={180} />
          <CardSkeleton label="recipes" height={220} />
        </>
      ) : (
        <KitchenBody k={k} />
      )}
    </Screen>
  );
}

function KitchenBody({ k }: { k: KitchenState }) {
  const f = useFoodColors();
  const coach = useCoach();
  const today = todayKey();
  const soon = k.pantry.filter((i) => ['today', 'soon', 'expired'].includes(expiryState(i, today)));
  const empty = k.pantry.length === 0;

  return (
    <>
      <Card tint={f.foodSoft}>
        <View
          accessible
          accessibilityLabel={`${k.pantry.length} items in your kitchen. ${k.cookNow.length} recipes you can cook now.${soon.length ? ` ${soon.length} to use soon.` : ''}`}
          style={{ flexDirection: 'row', justifyContent: 'space-around' }}
        >
          <BigStat value={String(k.pantry.length)} label="in kitchen" />
          <BigStat value={String(k.cookNow.length)} label="ready to cook" />
          <BigStat value={String(soon.length)} label="use soon" />
        </View>
        <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.md }}>
          <Button label="Add items" icon={Plus} onPress={() => router.push('/kitchen/add')} style={{ flex: 1 }} />
          <Button label="Scan" variant="secondary" icon={ScanBarcode} onPress={() => router.push('/kitchen/scan')} accessibilityLabel="Scan a product barcode" />
        </View>
        {k.plan.remainingKcal != null ? (
          <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
            About {Math.max(0, k.plan.remainingKcal)} kcal left today
            {k.plan.remainingProtein != null && k.plan.remainingProtein > 0 ? ` · ${k.plan.remainingProtein} g protein to go` : ''} — ideas below fit your{' '}
            {RECIPE_MEAL_LABEL[k.meal].toLowerCase()}.
          </Text>
        ) : (
          <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
            Set up your plan to get recipes sized to what’s left in your day.
          </Text>
        )}
      </Card>

      {empty ? (
        <Card>
          <CardHeader icon={ListPlus} label="Start your kitchen" accent={f.food} soft={f.foodSoft} />
          <Text>Tap what you usually keep at home — it takes a few seconds. You can also type a list or scan packets.</Text>
          <Button label="Tap what you usually keep" icon={Check} onPress={() => router.push('/kitchen/add?tab=staples')} style={{ marginTop: space.md }} />
        </Card>
      ) : null}

      {k.onPeriod ? (
        <InfoNote icon={ChefHat} accent={f.food} tint={f.foodSoft}>
          On your period, warm and iron-rich meals can feel good — those are nudged up a little.
        </InfoNote>
      ) : null}

      <AiCard hasKey={coach.hasKey} disabled={empty} />

      <KitchenSection title="Cook now" subtitle={`With what you have · ${RECIPE_MEAL_LABEL[k.meal]} first`} />
      {k.cookNow.length ? (
        k.cookNow.map((m) => <RecipeCard key={m.recipe.id} recipe={m.recipe} match={m} />)
      ) : (
        <Card>
          <EmptyNote
            icon={ChefHat}
            title={empty ? 'Your recipes will show up here' : 'Nothing complete yet'}
            body={empty ? 'Add a few things from your kitchen and Bloom will find healthy recipes you can make right now.' : 'Add a few more staples (like dal, atta or curd) — or try the recipes that are one item short below.'}
            accent={f.food}
          />
        </Card>
      )}

      {k.almostThere.length ? (
        <>
          <KitchenSection title="Almost there" subtitle="Missing just 1 item" />
          {k.almostThere.map((m) => (
            <AlmostRow key={m.recipe.id} m={m} k={k} />
          ))}
        </>
      ) : null}

      <KitchenSection
        title="My kitchen"
        subtitle={empty ? 'Nothing added yet' : `${k.pantry.length} items`}
        right={<IconButton icon={Plus} accessibilityLabel="Add items to my kitchen" onPress={() => router.push('/kitchen/add')} />}
      />
      <PantryList items={k.pantry} k={k} today={today} />

      <ShoppingCard k={k} />

      <KitchenSection title="My recipes" subtitle="Saved AI recipes" />
      {k.myRecipes.length ? (
        k.myRecipes.map((r) => <RecipeCard key={r.id} recipe={r} showFit={false} />)
      ) : (
        <Text tone="muted">Recipes you save from “Make me something healthy” appear here.</Text>
      )}

      <Button label="Browse all recipes" variant="secondary" icon={BookOpen} onPress={() => router.push('/kitchen/recipes')} style={{ marginTop: space.sm }} />
      <Text variant="caption" tone="muted">
        Nutrition is estimated from standard food tables (IFCT 2017, USDA). Not medical or dietetic advice.
      </Text>
    </>
  );
}

function AiCard({ hasKey, disabled }: { hasKey: boolean; disabled: boolean }) {
  const { c } = useTheme();
  return (
    <Card tint={c.sleepSoft}>
      <CardHeader icon={Sparkles} label="Make me something healthy" accent={c.sleep} soft={c.surface} />
      {hasKey ? (
        <>
          <Text tone="muted">Bloom’s AI can invent a recipe from what’s in your kitchen, sized to your plan.</Text>
          <Button
            label="Make me something"
            icon={Sparkles}
            onPress={() => router.push('/kitchen/ai')}
            disabled={disabled}
            accessibilityHint={disabled ? 'Add items to your kitchen first' : undefined}
            style={{ marginTop: space.sm }}
          />
        </>
      ) : (
        <>
          <Text tone="muted">Optional: add your free Gemini key in Settings → AI Coach to get AI recipe ideas from your kitchen.</Text>
          <Button label="Open Settings" variant="secondary" onPress={() => router.push('/settings')} style={{ marginTop: space.sm }} />
        </>
      )}
    </Card>
  );
}

function AlmostRow({ m, k }: { m: RecipeMatch; k: KitchenState }) {
  const [msg, setMsg] = useState<string | null>(null);
  const miss = m.missing[0];
  return (
    <View style={{ gap: 6 }}>
      <RecipeCard recipe={m.recipe} match={m} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
        <SmallButton
          label={`Add ${miss.name} to list`}
          icon={ShoppingCart}
          accessibilityLabel={`Add ${miss.name} to shopping list`}
          onPress={async () => {
            const id = await k.repos.shopping.add(miss.name, miss.key).catch(() => null);
            setMsg(id === null ? `${miss.name} is already on your list.` : `Added ${miss.name} to your shopping list.`);
          }}
        />
        {msg ? (
          <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
            {msg}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PantryList({ items, k, today }: { items: PantryItem[]; k: KitchenState; today: string }) {
  if (!items.length)
    return <Text tone="muted">Add groceries and packets you have at home — vegetables, dals, atta, paneer, eggs…</Text>;
  return (
    <>
      {groupByCategory(items).map((g) => (
        <Card key={g.category}>
          <Text variant="label" tone="muted" style={{ textTransform: 'uppercase', marginBottom: space.xs }} accessibilityRole="header">
            {CATEGORY_LABEL[g.category]} · {g.items.length}
          </Text>
          {g.items.map((it, i) => (
            <PantryRow key={it.id} item={it} first={i === 0} today={today} onUsedUp={() => k.repos.pantry.setUsedUp(it.id, true)} />
          ))}
        </Card>
      ))}
    </>
  );
}

function PantryRow({ item, first, today, onUsedUp }: { item: PantryItem; first: boolean; today: string; onUsedUp: () => void }) {
  const { c } = useTheme();
  const check = item.nutritionPer100g ? healthCheck(item.nutritionPer100g, item.nutriscore) : null;
  const qty = item.quantity != null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: first ? 0 : 1, borderTopColor: c.line, paddingVertical: 6 }}>
      <Pressable
        onPress={() => router.push(`/kitchen/item/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}${item.brand ? `, ${item.brand}` : ''}${qty ? `, ${qty}` : ''}${check ? `, health check ${check.title}` : ''}. Opens details.`}
        style={({ pressed }) => ({ flex: 1, minHeight: touch.min, justifyContent: 'center', gap: 4, opacity: pressed ? 0.7 : 1 })}
      >
        <Text variant="bodyStrong">
          {item.name}
          {qty ? <Text tone="muted"> · {qty}</Text> : null}
        </Text>
        {item.brand ? (
          <Text variant="caption" tone="muted">
            {item.brand}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <ExpiryChip item={item} today={today} />
          {check ? <HealthBadge check={check} compact /> : null}
        </View>
      </Pressable>
      <IconButton icon={Check} accessibilityLabel={`Mark ${item.name} as used up`} onPress={onUsedUp} />
    </View>
  );
}

function ShoppingCard({ k }: { k: KitchenState }) {
  const f = useFoodColors();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    try {
      const id = await k.repos.shopping.add(text);
      setError(id === null ? 'That’s already on your list.' : null);
      if (id !== null) setText('');
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : 'Couldn’t add that. Please try again.');
    }
  };
  const done = k.shopping.filter((s) => s.done).length;
  return (
    <Card>
      <CardHeader
        icon={ShoppingCart}
        label="Shopping list"
        accent={f.food}
        soft={f.foodSoft}
        right={
          k.shopping.length ? (
            <IconButton icon={Share2} accessibilityLabel="Share shopping list" onPress={() => Share.share({ message: shoppingListText(k.shopping) }).catch(() => {})} />
          ) : undefined
        }
      />
      {k.shopping.length ? (
        k.shopping.map((s, i) => <ShopRow key={s.id} s={s} first={i === 0} k={k} />)
      ) : (
        <Text tone="muted">Missing ingredients you add from recipes land here.</Text>
      )}
      <View style={{ marginTop: space.sm }}>
        <Field label="Add to shopping list" error={error}>
          <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Input
                value={text}
                onChangeText={(t) => {
                  setText(t);
                  setError(null);
                }}
                onSubmitEditing={add}
                returnKeyType="done"
                maxLength={80}
                error={!!error}
                accessibilityLabel="Add to shopping list"
              />
            </View>
            <IconButton icon={Plus} accessibilityLabel="Add item to shopping list" onPress={add} />
          </View>
        </Field>
      </View>
      {done ? (
        <Button
          label={`Clear ${done} bought`}
          variant="ghost"
          onPress={() => k.repos.shopping.clearDone()}
          style={{ marginTop: space.xs, alignSelf: 'flex-start', paddingHorizontal: space.sm }}
        />
      ) : null}
    </Card>
  );
}

function ShopRow({ s, first, k }: { s: ShoppingItem; first: boolean; k: KitchenState }) {
  const { c } = useTheme();
  const f = useFoodColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}>
      <Pressable
        onPress={() => k.repos.shopping.toggle(s.id)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: s.done }}
        accessibilityLabel={`${s.name}${s.done ? ', bought' : ''}`}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, opacity: pressed ? 0.7 : 1 })}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: s.done ? f.food : c.muted,
            backgroundColor: s.done ? f.foodSoft : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {s.done ? <Check size={16} color={f.foodStrong} strokeWidth={3} /> : null}
        </View>
        <Text style={{ flex: 1, textDecorationLine: s.done ? 'line-through' : 'none' }} tone={s.done ? 'muted' : 'ink'}>
          {s.name}
        </Text>
        {s.done ? <MetaChip label="Bought" /> : null}
      </Pressable>
      <IconButton icon={Trash2} accessibilityLabel={`Remove ${s.name} from shopping list`} onPress={() => k.repos.shopping.remove(s.id)} />
    </View>
  );
}
