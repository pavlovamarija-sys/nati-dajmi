import { Nunito_400Regular, Nunito_700Bold, Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TOY_CONDITION_LABELS } from '@/features/toy-analysis/domain/toy-condition-presentation';
import { createToyExchangeListingImageUrl, getOwnerToyExchangeListings } from '@/features/toy-exchange/repositories/toy-exchange-repository';
import { ToyExchangeWithdrawalError, withdrawToyExchangeListing } from '@/features/toy-exchange/services/withdraw-toy-exchange-listing';
import type { ToyExchangeListing, ToyExchangeListingStatus } from '@/features/toy-exchange/types/toy-exchange-listing';
import { beginToyExchangeListingWithdrawal, finishToyExchangeListingWithdrawal } from '../../../shared/toy-exchange-owner-listing';

type LoadState = 'loading' | 'ready' | 'error';

export default function OwnerToyExchangeListingsScreen() {
  const [fontsLoaded, fontError] = useFonts({ Nunito_400Regular, Nunito_700Bold, Nunito_800ExtraBold });
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [listings, setListings] = useState<ToyExchangeListing[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({});
  const [filter, setFilter] = useState<ToyExchangeListingStatus>('AVAILABLE');
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawingIds, setWithdrawingIds] = useState<Set<string>>(new Set());
  const withdrawalInFlight = useRef(new Set<string>());
  const mounted = useRef(true);

  const loadListings = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoadState('loading');
    try {
      const nextListings = await getOwnerToyExchangeListings();
      if (!mounted.current) return;
      setListings(nextListings);
      setLoadState('ready');
      const signedEntries = await Promise.all(nextListings.map(async (listing) => [listing.id, await createToyExchangeListingImageUrl(listing.imagePath)] as const));
      if (mounted.current) setImageUrls(Object.fromEntries(signedEntries));
    } catch {
      if (mounted.current) setLoadState('error');
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadListings();
    return () => { mounted.current = false; };
  }, [loadListings]);

  const withdraw = useCallback(async (listingId: string) => {
    if (!beginToyExchangeListingWithdrawal(withdrawalInFlight.current, listingId)) return;
    setWithdrawingIds((current) => new Set(current).add(listingId));
    try {
      await withdrawToyExchangeListing(listingId);
      if (mounted.current) await loadListings(true);
    } catch (error) {
      if (!mounted.current) return;
      const message = error instanceof ToyExchangeWithdrawalError && error.code === 'NOT_AVAILABLE'
        ? 'Оваа понуда повеќе не е активна.'
        : 'Не можевме да ја повлечеме понудата.';
      Alert.alert(message, 'Обиди се повторно.');
    } finally {
      finishToyExchangeListingWithdrawal(withdrawalInFlight.current, listingId);
      if (mounted.current) setWithdrawingIds((current) => { const next = new Set(current); next.delete(listingId); return next; });
    }
  }, [loadListings]);

  const confirmWithdrawal = useCallback((listingId: string) => {
    Alert.alert('Повлечи ја понудата', 'Дали сакаш да ја повлечеш оваа понуда?', [
      { text: 'Откажи', style: 'cancel' },
      { text: 'Повлечи', style: 'destructive', onPress: () => void withdraw(listingId) },
    ]);
  }, [withdraw]);

  if (!fontsLoaded && !fontError) return <SafeAreaView style={styles.center}><ActivityIndicator color="#2E6B4F" size="large" /></SafeAreaView>;
  const visibleListings = listings.filter((listing) => listing.status === filter);

  return <SafeAreaView style={styles.safeArea}><FlatList
    contentContainerStyle={styles.content}
    data={loadState === 'ready' ? visibleListings : []}
    keyExtractor={(item) => item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadListings(true)} tintColor="#2E6B4F" />}
    ListHeaderComponent={<>
      <Pressable accessibilityLabel="Назад" accessibilityRole="button" hitSlop={12} onPress={() => router.back()}><Text style={styles.back}>‹ Назад</Text></Pressable>
      <Text style={styles.title}>Моите играчки</Text>
      <View style={styles.filters}>{(['AVAILABLE', 'WITHDRAWN'] as const).map((status) => <Pressable key={status} accessibilityRole="button" accessibilityState={{ selected: filter === status }} onPress={() => setFilter(status)} style={[styles.filter, filter === status && styles.filterActive]}><Text style={[styles.filterText, filter === status && styles.filterTextActive]}>{status === 'AVAILABLE' ? 'Активни' : 'Повлечени'}</Text></Pressable>)}</View>
      {loadState === 'loading' && <View style={styles.state}><ActivityIndicator color="#2E6B4F" /><Text style={styles.stateText}>Ги вчитуваме играчките...</Text></View>}
      {loadState === 'error' && <View style={styles.state}><Text style={styles.stateTitle}>Не можевме да ги вчитаме играчките.</Text><Pressable accessibilityRole="button" onPress={() => void loadListings()} style={styles.action}><Text style={styles.actionText}>Обиди се повторно</Text></Pressable></View>}
      {loadState === 'ready' && visibleListings.length === 0 && <EmptyState hasListings={listings.length > 0} status={filter} />}
    </>}
    renderItem={({ item }) => <ListingCard imageUrl={imageUrls[item.id]} listing={item} onImageError={() => setImageUrls((current) => ({ ...current, [item.id]: null }))} onWithdraw={() => confirmWithdrawal(item.id)} withdrawing={withdrawingIds.has(item.id)} />}
  /></SafeAreaView>;
}

function EmptyState({ hasListings, status }: { hasListings: boolean; status: ToyExchangeListingStatus }) {
  if (hasListings) return <View style={styles.state}><Text style={styles.stateText}>{status === 'AVAILABLE' ? 'Немаш активни понуди.' : 'Немаш повлечени понуди.'}</Text></View>;
  return <View style={styles.state}><Text style={styles.stateTitle}>Сè уште немаш понудено играчки за размена.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/analyze')} style={styles.action}><Text style={styles.actionText}>Анализирај играчки</Text></Pressable></View>;
}

function ListingCard({ imageUrl, listing, onImageError, onWithdraw, withdrawing }: { imageUrl: string | null | undefined; listing: ToyExchangeListing; onImageError: () => void; onWithdraw: () => void; withdrawing: boolean }) {
  return <View style={styles.card}>
    {imageUrl ? <Image accessibilityLabel={`Фотографија од ${listing.name}`} onError={onImageError} resizeMode="contain" source={{ uri: imageUrl }} style={styles.image} /> : <View style={[styles.image, styles.imageFallback]}><Text style={styles.fallbackText}>Фотографијата не е достапна</Text></View>}
    <View style={styles.cardBody}><View style={styles.cardHeading}><Text style={styles.name}>{listing.name}</Text><Text style={[styles.badge, listing.status === 'WITHDRAWN' && styles.badgeWithdrawn]}>{listing.status === 'AVAILABLE' ? 'Активна' : 'Повлечена'}</Text></View>
      {listing.category && <Text style={styles.category}>{listing.category}</Text>}
      <Text style={styles.detail}>Состојба: {TOY_CONDITION_LABELS[listing.condition]}</Text><Text style={styles.price}>{listing.askingValueStars} ѕвездички</Text>
      {listing.description && <Text style={styles.description}>{listing.description}</Text>}
      {listing.status === 'AVAILABLE' && <Pressable accessibilityRole="button" accessibilityState={{ busy: withdrawing, disabled: withdrawing }} disabled={withdrawing} onPress={onWithdraw} style={styles.withdrawButton}><Text style={styles.withdrawText}>{withdrawing ? 'Ја повлекуваме...' : 'Повлечи ја понудата'}</Text></Pressable>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  safeArea:{flex:1,backgroundColor:'#FBF7F0'},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#FBF7F0'},content:{padding:20,paddingBottom:40,gap:16},back:{color:'#2E6B4F',fontFamily:'Nunito_700Bold',fontSize:16,marginBottom:12},title:{color:'#302A25',fontFamily:'Nunito_800ExtraBold',fontSize:30},filters:{backgroundColor:'#EEE5D8',borderRadius:14,flexDirection:'row',padding:4,marginBottom:4},filter:{alignItems:'center',borderRadius:11,flex:1,paddingVertical:10},filterActive:{backgroundColor:'#2E6B4F'},filterText:{color:'#6C6259',fontFamily:'Nunito_700Bold'},filterTextActive:{color:'#FFF'},state:{alignItems:'center',gap:12,paddingHorizontal:12,paddingVertical:36},stateTitle:{color:'#3A332D',fontFamily:'Nunito_700Bold',fontSize:18,textAlign:'center'},stateText:{color:'#716960',fontFamily:'Nunito_400Regular',fontSize:16,textAlign:'center'},action:{backgroundColor:'#2E6B4F',borderRadius:13,paddingHorizontal:18,paddingVertical:11},actionText:{color:'#FFF',fontFamily:'Nunito_700Bold'},card:{backgroundColor:'#FFFDF8',borderColor:'#E7D9C8',borderRadius:22,borderWidth:1,marginTop:16,overflow:'hidden',shadowColor:'#4A3E34',shadowOffset:{width:0,height:3},shadowOpacity:.08,shadowRadius:8,elevation:2},image:{backgroundColor:'#EEE7DD',height:190,width:'100%'},imageFallback:{alignItems:'center',justifyContent:'center',padding:20},fallbackText:{color:'#81766D',fontFamily:'Nunito_400Regular',textAlign:'center'},cardBody:{gap:7,padding:18},cardHeading:{alignItems:'flex-start',flexDirection:'row',gap:10},name:{color:'#302A25',flex:1,fontFamily:'Nunito_800ExtraBold',fontSize:21},badge:{backgroundColor:'#DDECE2',borderRadius:999,color:'#2E6B4F',fontFamily:'Nunito_700Bold',fontSize:12,overflow:'hidden',paddingHorizontal:10,paddingVertical:5},badgeWithdrawn:{backgroundColor:'#E8E2DC',color:'#716960'},category:{color:'#716960',fontFamily:'Nunito_400Regular'},detail:{color:'#4F4841',fontFamily:'Nunito_700Bold'},price:{color:'#C95F43',fontFamily:'Nunito_800ExtraBold',fontSize:19},description:{color:'#514A43',fontFamily:'Nunito_400Regular',fontSize:15,lineHeight:21,marginTop:4},withdrawButton:{alignItems:'center',borderColor:'#C95F43',borderRadius:13,borderWidth:1.5,marginTop:10,paddingVertical:11},withdrawText:{color:'#AD4C36',fontFamily:'Nunito_700Bold'},
});
