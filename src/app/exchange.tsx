import { Nunito_400Regular, Nunito_700Bold, Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TOY_CONDITION_LABELS } from '@/features/toy-analysis/domain/toy-condition-presentation';
import { browseToyExchangeListings } from '@/features/toy-exchange/services/browse-toy-exchange-listings';
import type { MarketplaceListing } from '@/features/toy-exchange/types/marketplace-listing';

type LoadState = 'loading' | 'ready' | 'error';

export default function ToyExchangeMarketplaceScreen() {
  const [fontsLoaded, fontError] = useFonts({ Nunito_400Regular, Nunito_700Bold, Nunito_800ExtraBold });
  const [state, setState] = useState<LoadState>('loading');
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailableImages, setUnavailableImages] = useState<Set<string>>(new Set());
  const mounted = useRef(true);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setState('loading');
    try {
      const next = await browseToyExchangeListings();
      if (!mounted.current) return;
      setListings(next);
      setUnavailableImages(new Set());
      setState('ready');
    } catch {
      if (mounted.current) setState('error');
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  if (!fontsLoaded && !fontError) return <SafeAreaView style={styles.center}><ActivityIndicator color="#2E6B4F" size="large" /></SafeAreaView>;

  return <SafeAreaView style={styles.safeArea}><FlatList
    contentContainerStyle={styles.content}
    data={state === 'ready' ? listings : []}
    keyExtractor={(item) => item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#2E6B4F" />}
    ListHeaderComponent={<>
      <Pressable accessibilityLabel="Назад" accessibilityRole="button" hitSlop={12} onPress={() => router.back()}><Text style={styles.back}>‹ Назад</Text></Pressable>
      <Text style={styles.title}>Размена</Text>
      <Text style={styles.subtitle}>Откриј играчки што други родители ги нудат за размена.</Text>
      {state === 'loading' && <View style={styles.state}><ActivityIndicator color="#2E6B4F" /><Text style={styles.stateText}>Ги вчитуваме достапните играчки...</Text></View>}
      {state === 'error' && <View style={styles.state}><Text style={styles.stateTitle}>Не можевме да ги вчитаме играчките.</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.action}><Text style={styles.actionText}>Обиди се повторно</Text></Pressable></View>}
      {state === 'ready' && listings.length === 0 && <View style={styles.state}><Text style={styles.stateTitle}>Во моментов нема достапни играчки за размена.</Text></View>}
    </>}
    renderItem={({ item }) => <MarketplaceCard imageUnavailable={unavailableImages.has(item.id)} listing={item} onImageError={() => setUnavailableImages((current) => new Set(current).add(item.id))} />}
  /></SafeAreaView>;
}

function MarketplaceCard({ imageUnavailable, listing, onImageError }: { imageUnavailable: boolean; listing: MarketplaceListing; onImageError: () => void }) {
  const showImage = Boolean(listing.imageUrl) && !imageUnavailable;
  return <View style={styles.card}>
    {showImage ? <Image accessibilityLabel={`Фотографија од ${listing.name}`} onError={onImageError} resizeMode="contain" source={{ uri: listing.imageUrl! }} style={styles.image} /> : <View style={[styles.image, styles.imageFallback]}><Text style={styles.fallbackText}>Фотографијата не е достапна</Text></View>}
    <View style={styles.cardBody}><View style={styles.heading}><Text style={styles.name}>{listing.name}</Text><Text style={styles.available}>Достапна</Text></View>
      {listing.category && <Text style={styles.category}>{listing.category}</Text>}
      <Text style={styles.condition}>Состојба: {TOY_CONDITION_LABELS[listing.condition]}</Text>
      <Text style={styles.price}>{listing.askingValueStars} ѕвездички</Text>
      {listing.description && <Text style={styles.description}>{listing.description}</Text>}
      <Text style={styles.note}>Достапна за размена</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  safeArea:{flex:1,backgroundColor:'#FBF7F0'},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#FBF7F0'},content:{padding:20,paddingBottom:40},back:{color:'#2E6B4F',fontFamily:'Nunito_700Bold',fontSize:16,marginBottom:12},title:{color:'#302A25',fontFamily:'Nunito_800ExtraBold',fontSize:32},subtitle:{color:'#716960',fontFamily:'Nunito_400Regular',fontSize:16,lineHeight:22,marginBottom:6,marginTop:6},state:{alignItems:'center',gap:12,paddingHorizontal:12,paddingVertical:42},stateTitle:{color:'#3A332D',fontFamily:'Nunito_700Bold',fontSize:18,textAlign:'center'},stateText:{color:'#716960',fontFamily:'Nunito_400Regular',fontSize:16,textAlign:'center'},action:{backgroundColor:'#2E6B4F',borderRadius:13,paddingHorizontal:18,paddingVertical:11},actionText:{color:'#FFF',fontFamily:'Nunito_700Bold'},card:{backgroundColor:'#FFFDF8',borderColor:'#E7D9C8',borderRadius:22,borderWidth:1,marginTop:18,overflow:'hidden',shadowColor:'#4A3E34',shadowOffset:{width:0,height:3},shadowOpacity:.08,shadowRadius:8,elevation:2},image:{backgroundColor:'#EEE7DD',height:200,width:'100%'},imageFallback:{alignItems:'center',justifyContent:'center',padding:20},fallbackText:{color:'#81766D',fontFamily:'Nunito_400Regular',textAlign:'center'},cardBody:{gap:7,padding:18},heading:{alignItems:'flex-start',flexDirection:'row',gap:10},name:{color:'#302A25',flex:1,fontFamily:'Nunito_800ExtraBold',fontSize:21},available:{backgroundColor:'#DDECE2',borderRadius:999,color:'#2E6B4F',fontFamily:'Nunito_700Bold',fontSize:12,overflow:'hidden',paddingHorizontal:10,paddingVertical:5},category:{color:'#716960',fontFamily:'Nunito_400Regular'},condition:{color:'#4F4841',fontFamily:'Nunito_700Bold'},price:{color:'#C95F43',fontFamily:'Nunito_800ExtraBold',fontSize:19},description:{color:'#514A43',fontFamily:'Nunito_400Regular',fontSize:15,lineHeight:21,marginTop:4},note:{color:'#2E6B4F',fontFamily:'Nunito_700Bold',fontSize:13,marginTop:7},
});
