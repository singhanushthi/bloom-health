/**
 * Add to my kitchen: quick search, "type a list" (parsed on the phone), or tap the staples you
 * usually keep. Barcode scan and a manual packaged-product form are one tap away.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { Check, PackageOpen, Plus, ScanBarcode, Search } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { ChipRow, Field, Input, ToggleChip } from '../../components/sheets/Sheet';
import { Button, Card, Segmented, Text } from '../../components/ui';
import { todayKey } from '../../health/dates';
import { useKitchenVersion } from '../../kitchen/events';
import { CATEGORY_LABEL, getIngredient, PANTRY_CATEGORIES, searchIngredients, STAPLES, type Ingredient } from '../../kitchen/ingredients';
import { draftFromIngredient, pantryKeys } from '../../kitchen/pantry';
import { parseFreeText } from '../../kitchen/parse';
import { useFoodColors } from '../../kitchen/ui/parts';
import { useKitchenRepos } from '../../kitchen/useKitchen';
import { BackHeader, SmallButton } from '../../plan/ui/parts';
import { space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

type Tab = 'search' | 'type' | 'staples';

export default function AddToKitchen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'staples' ? 'staples' : params.tab === 'type' ? 'type' : 'search');
  const repos = useKitchenRepos();
  const version = useKitchenVersion();
  const [have, setHave] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    repos.pantry
      .list()
      .then((items) => setHave(new Set(pantryKeys(items))))
      .catch(() => {});
  }, [repos, version]);

  const addKeys = async (keys: string[]) => {
    const today = todayKey();
    const drafts = keys.map((k) => getIngredient(k)).filter((i): i is Ingredient => !!i).map((i) => draftFromIngredient(i, today));
    const ids = await repos.pantry.addMany(drafts);
    setStatus(ids.length ? `Added ${ids.length} item${ids.length === 1 ? '' : 's'} to your kitchen.` : 'Those are already in your kitchen.');
    return ids.length;
  };

  return (
    <Screen>
      <BackHeader title="Add to kitchen" subtitle="Saved only on this phone" />
      <DemoBanner />
      <Segmented<Tab>
        accessibilityLabel="How to add"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setStatus(null);
        }}
        options={[
          { value: 'search', label: 'Search' },
          { value: 'type', label: 'Type a list' },
          { value: 'staples', label: 'Staples' },
        ]}
      />
      {status ? (
        <Text accessibilityLiveRegion="polite" variant="bodyStrong">
          {status}
        </Text>
      ) : null}
      {tab === 'search' ? <SearchTab have={have} onAdd={(k) => addKeys([k])} /> : null}
      {tab === 'type' ? <TypeTab have={have} onAdd={addKeys} /> : null}
      {tab === 'staples' ? <StaplesTab have={have} onAdd={addKeys} /> : null}

      <Card>
        <Text variant="bodyStrong">Packets and products</Text>
        <Text tone="muted">Scan the barcode to see a friendly health check, or type the label by hand.</Text>
        <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.sm, flexWrap: 'wrap' }}>
          <Button label="Scan barcode" icon={ScanBarcode} onPress={() => router.push('/kitchen/scan')} style={{ flexGrow: 1 }} />
          <Button label="Add by hand" variant="secondary" icon={PackageOpen} onPress={() => router.push('/kitchen/product')} style={{ flexGrow: 1 }} />
        </View>
      </Card>
    </Screen>
  );
}

function SearchTab({ have, onAdd }: { have: Set<string>; onAdd: (key: string) => Promise<number> }) {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const results = useMemo(() => searchIngredients(q, 20), [q]);
  return (
    <View style={{ gap: space.sm }}>
      <Field label="Search ingredients" hint="English or Hindi — e.g. “palak”, “dahi”, “atta”.">
        <Input value={q} onChangeText={setQ} autoFocus autoCorrect={false} returnKeyType="search" maxLength={40} accessibilityLabel="Search ingredients" />
      </Field>
      {q.trim() && !results.length ? (
        <Card>
          <Text>No match for “{q.trim()}”.</Text>
          <SmallButton
            label={`Add “${q.trim()}” as my own item`}
            icon={Plus}
            onPress={() => router.push(`/kitchen/product?name=${encodeURIComponent(q.trim())}`)}
          />
        </Card>
      ) : null}
      {results.map((i) => (
        <IngredientRow key={i.key} ing={i} inKitchen={have.has(i.key)} onAdd={() => onAdd(i.key)} />
      ))}
      {!q.trim() ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Search size={16} color={c.muted} />
          <Text tone="muted">Start typing to find an ingredient.</Text>
        </View>
      ) : null}
    </View>
  );
}

function IngredientRow({ ing, inKitchen, onAdd }: { ing: Ingredient; inKitchen: boolean; onAdd: () => void }) {
  const { c } = useTheme();
  const f = useFoodColors();
  const hindi = ing.aliases.find((a) => /[ऀ-ॿ]/.test(a));
  const alias = ing.aliases.find((a) => !/[ऀ-ॿ]/.test(a));
  return (
    <Pressable
      onPress={inKitchen ? undefined : onAdd}
      disabled={inKitchen}
      accessibilityRole="button"
      accessibilityLabel={inKitchen ? `${ing.name}, already in your kitchen` : `Add ${ing.name}`}
      accessibilityState={{ disabled: inKitchen }}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: 56,
        paddingHorizontal: space.md,
        paddingVertical: space.xs,
        borderRadius: 18,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{ing.name}</Text>
        <Text variant="caption" tone="muted">
          {[alias, hindi, CATEGORY_LABEL[ing.category]].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {inKitchen ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Check size={18} color={f.foodStrong} />
          <Text variant="caption">In kitchen</Text>
        </View>
      ) : (
        <View style={{ width: touch.min, height: touch.min, borderRadius: 14, backgroundColor: f.foodSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={22} color={f.foodStrong} />
        </View>
      )}
    </Pressable>
  );
}

function TypeTab({ have, onAdd }: { have: Set<string>; onAdd: (keys: string[]) => Promise<number> }) {
  const f = useFoodColors();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ keys: string[]; unknown: string[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const find = () => {
    const r = parseFreeText(text);
    if (!r.keys.length && !r.unknown.length) {
      setError('Type a few things you have, separated by commas.');
      setFound(null);
      return;
    }
    setError(r.keys.length ? null : 'Bloom didn’t recognise those — you can add them as your own items below.');
    setFound(r);
    setPicked(new Set(r.keys.filter((k) => !have.has(k))));
  };

  return (
    <View style={{ gap: space.sm }}>
      <Field label="What do you have?" hint="For example: paneer, palak, 2 onions, tamatar, dahi, eggs" error={error}>
        <Input
          value={text}
          onChangeText={(t) => {
            setText(t);
            setError(null);
          }}
          multiline
          maxLength={500}
          error={!!error}
          accessibilityLabel="What do you have?"
          style={{ minHeight: 96, paddingTop: space.sm, textAlignVertical: 'top' }}
        />
      </Field>
      <Button label="Find ingredients" icon={Search} variant="secondary" onPress={find} />
      {found ? (
        <Card>
          {found.keys.length ? (
            <>
              <Text variant="bodyStrong">Found {found.keys.length}</Text>
              <Text variant="caption" tone="muted" style={{ marginBottom: space.xs }}>
                Untick anything you don’t want to add.
              </Text>
              <ChipRow label="Found ingredients">
                {found.keys.map((k) => {
                  const ing = getIngredient(k)!;
                  const inK = have.has(k);
                  return (
                    <ToggleChip
                      key={k}
                      label={inK ? `${ing.name} (in kitchen)` : ing.name}
                      selected={picked.has(k)}
                      accent={f.foodStrong}
                      soft={f.foodSoft}
                      onPress={() =>
                        setPicked((p) => {
                          const n = new Set(p);
                          if (n.has(k)) n.delete(k);
                          else n.add(k);
                          return n;
                        })
                      }
                    />
                  );
                })}
              </ChipRow>
              <Button
                label={picked.size ? `Add ${picked.size} item${picked.size === 1 ? '' : 's'}` : 'Nothing selected'}
                icon={Plus}
                disabled={!picked.size}
                onPress={async () => {
                  await onAdd(Array.from(picked));
                  setPicked(new Set());
                }}
                style={{ marginTop: space.md }}
              />
            </>
          ) : null}
          {found.unknown.length ? (
            <View style={{ marginTop: found.keys.length ? space.md : 0, gap: space.xs }}>
              <Text variant="bodyStrong">Not recognised</Text>
              {found.unknown.map((u) => (
                <SmallButton key={u} label={`Add “${u}” as my own item`} icon={Plus} onPress={() => router.push(`/kitchen/product?name=${encodeURIComponent(u)}`)} />
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}

function StaplesTab({ have, onAdd }: { have: Set<string>; onAdd: (keys: string[]) => Promise<number> }) {
  const f = useFoodColors();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const groups = PANTRY_CATEGORIES.map((cat) => ({ cat, items: STAPLES.filter((s) => s.category === cat) })).filter((g) => g.items.length);
  return (
    <View style={{ gap: space.md }}>
      <Text variant="title" accessibilityRole="header">
        Tap what you usually keep
      </Text>
      {groups.map((g) => (
        <View key={g.cat} style={{ gap: space.xs }}>
          <Text variant="label" tone="muted" style={{ textTransform: 'uppercase' }}>
            {CATEGORY_LABEL[g.cat]}
          </Text>
          <ChipRow label={CATEGORY_LABEL[g.cat]}>
            {g.items.map((i) => {
              const inK = have.has(i.key);
              return (
                <ToggleChip
                  key={i.key}
                  label={inK ? `${i.name} ✓ in kitchen` : i.name}
                  selected={inK || picked.has(i.key)}
                  accent={f.foodStrong}
                  soft={f.foodSoft}
                  onPress={() => {
                    if (inK) return;
                    setPicked((p) => {
                      const n = new Set(p);
                      if (n.has(i.key)) n.delete(i.key);
                      else n.add(i.key);
                      return n;
                    });
                  }}
                />
              );
            })}
          </ChipRow>
        </View>
      ))}
      <Button
        label={picked.size ? `Add ${picked.size} to my kitchen` : 'Tap items above'}
        icon={Check}
        disabled={!picked.size}
        onPress={async () => {
          await onAdd(Array.from(picked));
          setPicked(new Set());
          if (router.canGoBack()) router.back();
        }}
      />
      <Text variant="caption" tone="muted">
        Fresh items get an estimated “use by” date that you can change any time.
      </Text>
    </View>
  );
}
